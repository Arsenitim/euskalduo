<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Content\ImportValidator;
use App\Content\LineParser;
use App\Content\SetRepository;
use App\Tests\TempDirs;
use PHPUnit\Framework\TestCase;

final class ImportValidatorTest extends TestCase
{
    use TempDirs;

    private ImportValidator $validator;

    protected function setUp(): void
    {
        $this->validator = new ImportValidator();
    }

    public function testHandoutSampleKeepsSpellingAndSeparateAlternatives(): void
    {
        $result = $this->validator->validate($this->sample('hiztegia-1-gaia.json'));

        self::assertTrue($result->isValid(), json_encode($result->errors, \JSON_UNESCAPED_UNICODE));
        $entries = $result->draft['entries'];
        self::assertCount(26, $entries);
        self::assertSame(['Zaborrontzia', 'Ordularia'], [$entries[0]['basque'], $entries[1]['basque']]);
        self::assertSame('Aire girotua', $entries[25]['basque']);

        $byTerm = array_column($entries, null, 'basque');
        self::assertSame('Bizkar-zorroa', $byTerm['Bizkar-zorroa']['basque']);
        self::assertSame(['campeonato', 'concurso'], $byTerm['Txapelketa']['translations']['es']);
        self::assertSame(['taller', 'fábrica'], $byTerm['Lantegi']['translations']['es']);
        self::assertSame(['cómodo'], $byTerm['Erosoa']['translations']['es']);
        self::assertNull($result->draft['weekStart'], 'The handout has no date; the admin assigns it.');
    }

    public function testCalendarSampleHasOrderedGroupsWithoutDates(): void
    {
        $result = $this->validator->validate($this->sample('hilabeteak-eta-astegunak.json'));

        self::assertTrue($result->isValid());
        self::assertSame([
            ['key' => 'hilabeteak', 'title' => 'HILABETEAK', 'ordered' => true],
            ['key' => 'astegunak', 'title' => 'ASTEGUNAK', 'ordered' => true],
        ], $result->draft['groups']);
        $months = array_values(array_filter($result->draft['entries'], static fn (array $e): bool => 'hilabeteak' === $e['group']));
        self::assertCount(12, $months);
        self::assertSame('urtarrila', $months[0]['basque']);
        self::assertSame('abendua', $months[11]['basque']);
        self::assertSame(['miércoles'], $result->draft['entries'][14]['translations']['es']);
    }

    public function testDecomposedAccentsAreStoredPrecomposed(): void
    {
        $result = $this->validator->validate($this->doc([
            ['basque' => "  Lantegi \t", 'translations' => ['es' => ["fa\u{0301}brica"]]],
        ]));

        self::assertTrue($result->isValid());
        self::assertSame('Lantegi', $result->draft['entries'][0]['basque']);
        self::assertSame("f\u{00E1}brica", $result->draft['entries'][0]['translations']['es'][0]);
    }

    public function testErrorsPointAtTheOffendingEntry(): void
    {
        $result = $this->validator->validate($this->doc([
            ['basque' => 'sagarra', 'translations' => ['es' => ['la manzana']]],
            ['basque' => '', 'translations' => ['es' => ['sin término']]],
            ['basque' => 'etxea', 'translations' => ['ru' => ['дом']]],
            ['basque' => 'katua', 'translations' => ['fr' => ['le chat'], 'es' => ['el gato']]],
            'not an object',
        ]));

        self::assertFalse($result->isValid());
        $byEntry = [];
        foreach ($result->errors as $error) {
            $byEntry[$error['entry']][] = $error['path'];
        }
        self::assertArrayNotHasKey(0, $byEntry);
        self::assertSame(['entries[1].basque'], $byEntry[1]);
        self::assertSame(['entries[2].translations.es'], $byEntry[2]);
        self::assertSame(['entries[3].translations.fr'], $byEntry[3]);
        self::assertContains('entries[4]', $byEntry[4]);
        self::assertCount(5, $result->draft['entries'], 'Indexes must stay aligned with the input for the review screen.');
    }

    public function testMarkupAndControlCharactersAreRejected(): void
    {
        $result = $this->validator->validate($this->doc([
            ['basque' => '<img src=x onerror=alert(1)>', 'translations' => ['es' => ['x']]],
            ['basque' => "zakurra\u{0007}", 'translations' => ['es' => ['perro']]],
            ['basque' => "abc\u{202E}cba", 'translations' => ['es' => ['y']]],
        ]));

        self::assertSame(['entries[0].basque', 'entries[1].basque', 'entries[2].basque'], array_column($result->errors, 'path'));
    }

    public function testCommaInsideASingleTranslationIsFlaggedNotSplit(): void
    {
        $result = $this->validator->validate($this->doc([
            ['basque' => 'Txapelketa', 'translations' => ['es' => 'campeonato, concurso']],
        ]));

        self::assertTrue($result->isValid());
        self::assertSame(['campeonato, concurso'], $result->draft['entries'][0]['translations']['es']);
        self::assertStringContainsString('list them separately', $result->warnings[0]['message']);
    }

    public function testDuplicatesProduceWarnings(): void
    {
        $result = $this->validator->validate($this->doc([
            ['basque' => 'Hiria', 'translations' => ['es' => ['ciudad', 'Ciudad']]],
            ['basque' => 'hiria', 'translations' => ['es' => ['urbe']]],
            ['basque' => 'Txalupa', 'translations' => ['es' => ['barca']]],
            ['basque' => 'Batela', 'translations' => ['es' => ['barca']]],
        ]));

        self::assertTrue($result->isValid());
        self::assertSame(['ciudad'], $result->draft['entries'][0]['translations']['es']);
        $messages = implode("\n", array_column($result->warnings, 'message'));
        self::assertStringContainsString('Repeated alternative', $messages);
        self::assertStringContainsString('Duplicate Basque term: same as entry 1', $messages);
        self::assertStringContainsString('“barca” is also a translation of entry 3', $messages);
    }

    public function testDocumentLevelRules(): void
    {
        $result = $this->validator->validate([
            'title' => 'x',
            'weekStart' => '2026-02-30',
            'groups' => [['key' => 'Bad Key', 'title' => 'x']],
            'entries' => [['basque' => 'a', 'translations' => ['es' => ['b']], 'group' => 'missing']],
        ]);

        self::assertEqualsCanonicalizing(
            ['schemaVersion', 'weekStart', 'groups[0].key', 'entries[0].group'],
            array_column($result->errors, 'path'),
        );
    }

    public function testTopicsHaveNoWeekAndPublishWithoutOne(): void
    {
        foreach (['astegunak.json' => 7, 'hilabeteak.json' => 12] as $file => $count) {
            $result = $this->validator->validate($this->sample("topics/$file"));
            self::assertTrue($result->isValid(), json_encode($result->errors));
            self::assertSame('topic', $result->draft['kind']);
            self::assertCount($count, $result->draft['entries']);
            self::assertTrue($result->draft['groups'][0]['ordered']);
            self::assertSame([], SetRepository::publishBlockers($result->draft));
        }

        $dated = $this->validator->validate(['kind' => 'topic', 'weekStart' => '2026-09-21'] + $this->doc([['basque' => 'etxea', 'translations' => ['es' => ['casa']]]]));
        self::assertNull($dated->draft['weekStart']);
        self::assertSame(['weekStart'], array_column($dated->warnings, 'path'));

        $week = $this->validator->validate($this->doc([['basque' => 'etxea', 'translations' => ['es' => ['casa']]]]));
        self::assertSame('week', $week->draft['kind'], 'Sets are homework weeks unless marked otherwise.');
        self::assertNotSame([], SetRepository::publishBlockers($week->draft), 'A week still needs its date.');

        self::assertFalse($this->validator->validate(['kind' => 'unit'] + $this->doc([['basque' => 'a', 'translations' => ['es' => ['b']]]]))->isValid());
    }

    public function testNonMondayWeekStartIsOnlyAWarning(): void
    {
        $doc = $this->doc([['basque' => 'a', 'translations' => ['es' => ['b']]]]);
        $doc['weekStart'] = '2026-09-23';
        $result = $this->validator->validate($doc);

        self::assertTrue($result->isValid());
        self::assertSame('2026-09-23', $result->draft['weekStart']);
        self::assertSame('weekStart', $result->warnings[0]['path']);
    }

    public function testEmojiMustNotCarryText(): void
    {
        $result = $this->validator->validate($this->doc([
            ['basque' => 'a', 'translations' => ['es' => ['b']], 'emoji' => '🏙️'],
            ['basque' => 'c', 'translations' => ['es' => ['d']], 'emoji' => 'apple'],
        ]));

        self::assertSame(['entries[1].emoji'], array_column($result->errors, 'path'));
    }

    public function testLineFormatKeepsHyphenatedWordsAndSplitsAlternatives(): void
    {
        $parsed = (new LineParser())->parse(<<<'TXT'
            # HIZTEGIA (1.Gaia)
            Bizkar-zorroa — mochila
            Txapelketa – campeonato; concurso
            Lantegi - taller, fábrica
            Aire girotua	aire acondicionado
            just a word
            TXT);

        self::assertSame([['path' => 'line 6', 'entry' => null, 'message' => 'Line 6 is not in the form “Basque — Spanish”: just a word']], $parsed['errors']);
        $result = $this->validator->validate($parsed['document']);
        $entries = $result->draft['entries'];
        self::assertSame(['Bizkar-zorroa', 'Txapelketa', 'Lantegi', 'Aire girotua'], array_column($entries, 'basque'));
        self::assertSame(['campeonato', 'concurso'], $entries[1]['translations']['es']);
        self::assertSame(['taller', 'fábrica'], $entries[2]['translations']['es']);
        self::assertSame('title', $result->errors[0]['path'], 'Line imports need a title during review.');
    }

    /** @return array<string, mixed> */
    private function sample(string $file): array
    {
        return json_decode((string) file_get_contents(self::samplePath($file)), true, 64, \JSON_THROW_ON_ERROR);
    }

    /**
     * @param list<mixed> $entries
     *
     * @return array<string, mixed>
     */
    private function doc(array $entries): array
    {
        return ['schemaVersion' => 1, 'title' => 'Test', 'entries' => $entries];
    }
}
