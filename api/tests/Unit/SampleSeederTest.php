<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Content\Database;
use App\Content\ImportValidator;
use App\Content\SampleSeeder;
use App\Content\SetRepository;
use App\Tests\TempDirs;
use PHPUnit\Framework\TestCase;

final class SampleSeederTest extends TestCase
{
    use TempDirs;

    protected function tearDown(): void
    {
        $this->removeTempDirs();
    }

    public function testSamplesAreSeededOnlyOnceAndNeverRecreated(): void
    {
        $db = new Database($this->tempDir());
        $sets = new SetRepository($db);
        $seeder = new SampleSeeder($db, $sets, new ImportValidator());
        $sampleDir = \dirname(self::samplePath('hiztegia-1-gaia.json'));

        $titles = $seeder->seedOnce($sampleDir);
        self::assertSame(['HIZTEGIA (1.Gaia)', 'HILABETEAK ETA ASTEGUNAK'], $titles);
        $published = $sets->publishedContent();
        self::assertSame([null, null], array_column($published, 'receivedOn'), 'Samples no longer get invented dates.');
        self::assertTrue($published[0]['sample']);

        foreach ($sets->listSummaries() as $summary) {
            $sets->delete($summary['id']);
        }
        self::assertSame([], $seeder->seedOnce($sampleDir));
        self::assertSame([], $sets->listSummaries(), 'Deleted samples must not come back on the next start.');
    }

    public function testCategoriesAreSeededOnceAlsoIntoExistingDatabases(): void
    {
        $db = new Database($this->tempDir());
        $sets = new SetRepository($db);
        $seeder = new SampleSeeder($db, $sets, new ImportValidator());
        $sampleDir = \dirname(self::samplePath('hiztegia-1-gaia.json'));
        $seeder->seedOnce($sampleDir);

        self::assertSame(['ASTEGUNAK', 'Esaldiak · Frases', 'Gramatika · Gramática', 'HILABETEAK', 'Formación de palabras · Hitz motak'], $seeder->seedTopicsOnce($sampleDir.'/topics'));
        $published = $sets->publishedContent();
        self::assertSame(['sheet', 'sheet', 'topic', 'topic', 'topic'], array_column($published, 'kind'), 'Sheets first, then topics.');
        self::assertSame(['HILABETEAK ETA ASTEGUNAK', 'HIZTEGIA (1.Gaia)'], array_column(\array_slice($published, 0, 2), 'title'), 'By title, not by date.');
        self::assertSame([null, null, null], array_column(\array_slice($published, 2), 'receivedOn'));
        self::assertFalse($published[2]['sample']);
        self::assertSame(['astelehena', 'asteartea'], \array_slice(array_column($published[2]['entries'], 'id'), 0, 2));

        self::assertSame([], $seeder->seedTopicsOnce($sampleDir.'/topics'));
        self::assertCount(7, $sets->listSummaries(), 'the two structured topics wait as drafts');
    }

    public function testWeeksAreSeededOncePerFileWithTheirOwnDates(): void
    {
        $db = new Database($this->tempDir());
        $sets = new SetRepository($db);
        $seeder = new SampleSeeder($db, $sets, new ImportValidator());
        $weekDir = \dirname(self::samplePath('hiztegia-1-gaia.json')).'/weeks';

        self::assertSame(
            ['Hitz motak, izan eta denborazkoak', 'HIZTEGIA (2. Maila)', 'Lexikoa: Denborazkoak', 'HIZTEGIA (DENBORAZKOAK)'],
            $seeder->seedWeeksOnce($weekDir),
        );
        $byTitle = array_column($sets->publishedContent(), null, 'title');
        $hitzMotak = $byTitle['Hitz motak, izan eta denborazkoak'];
        self::assertSame('sheet', $hitzMotak['kind']);
        self::assertSame('2026-10-05', $hitzMotak['receivedOn']);
        self::assertFalse($hitzMotak['sample']);
        self::assertCount(57, $hitzMotak['entries']);
        self::assertNotNull($hitzMotak['entries'][0]['formation']);
        self::assertSame('2026-09-28', $byTitle['HIZTEGIA (DENBORAZKOAK)']['receivedOn']);
        self::assertCount(23, $byTitle['HIZTEGIA (DENBORAZKOAK)']['entries']);
        self::assertSame('2026-11-02', $byTitle['Lexikoa: Denborazkoak']['receivedOn']);
        self::assertCount(23, $byTitle['Lexikoa: Denborazkoak']['entries']);

        $sets->delete($hitzMotak['id']);
        self::assertSame([], $seeder->seedWeeksOnce($weekDir), 'Deleted weeks must not come back on the next start.');

        $extra = $this->tempDir();
        copy($weekDir.'/hiztegia-denborazkoak.json', $extra.'/hiztegia-denborazkoak.json');
        $other = json_decode((string) file_get_contents($weekDir.'/hiztegia-denborazkoak.json'), true);
        $other['title'] = 'Later week';
        $other['receivedOn'] = '2026-10-05';
        file_put_contents($extra.'/later.json', json_encode($other));
        self::assertSame(['Later week'], $seeder->seedWeeksOnce($extra), 'A week added later still reaches this install.');
    }

    public function testNewCategoryReachesLegacyInstallsWithoutRecreatingOldCategories(): void
    {
        $db = new Database($this->tempDir());
        $db->setMeta('topics_seeded', 'already seeded');
        $sets = new SetRepository($db);
        $seeder = new SampleSeeder($db, $sets, new ImportValidator());
        $dir = \dirname(self::samplePath('hiztegia-1-gaia.json')).'/topics';
        self::assertSame(['Esaldiak · Frases', 'Gramatika · Gramática', 'Formación de palabras · Hitz motak'], $seeder->seedTopicsOnce($dir));
        $sets->delete($sets->publishedContent()[0]['id']);
        self::assertSame([], $seeder->seedTopicsOnce($dir));
        self::assertSame([], $sets->publishedContent());
    }

    public function testExistingDatabaseGainsTheKindColumn(): void
    {
        $dir = $this->tempDir();
        $pdo = new \PDO('sqlite:'.$dir.'/euskalduo.sqlite');
        $pdo->exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        $pdo->exec("INSERT INTO meta VALUES ('schema_version', '2')");
        $pdo->exec("CREATE TABLE homework_sets (id TEXT PRIMARY KEY, title TEXT NOT NULL, week_start TEXT, description TEXT, groups_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL, is_sample INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT)");
        $pdo->exec("INSERT INTO homework_sets (id, title, week_start, status, created_at, updated_at) VALUES ('sold', 'Old week', '2026-09-14', 'published', 'x', 'x')");
        unset($pdo);

        $db = new Database($dir);
        self::assertSame('sheet', (new SetRepository($db))->find('sold')['kind']);
        self::assertSame((string) Database::SCHEMA_VERSION, $db->getMeta('schema_version'));
    }

    public function testVersion7DatabaseMigratesWithoutLosingContentAndKeepsExamLinks(): void
    {
        $dir = $this->tempDir();
        $db = new Database($dir);
        $sets = new SetRepository($db);
        $validator = new ImportValidator();
        $id = $sets->create($validator->validate(['schemaVersion' => 1, 'title' => 'Week', 'weekStart' => '2026-09-28', 'entries' => [['id' => 'gaur', 'basque' => 'gaur', 'translations' => ['es' => ['hoy']]]]])->draft);
        $sets->setStatus($id, 'published');
        // Turn it back into a version 7 database: no v8 columns or tables, an exam date on the set.
        $pdo = $db->pdo();
        $pdo->exec('DROP TABLE exams');
        $pdo->exec('DROP TABLE stories');
        $pdo->exec('ALTER TABLE entries DROP COLUMN entry_type');
        $pdo->exec('ALTER TABLE entries DROP COLUMN exercise_json');
        $pdo->prepare('UPDATE homework_sets SET exam_date = ? WHERE id = ?')->execute(['2026-12-01', $id]);
        $pdo->exec("UPDATE meta SET value = '7' WHERE key = 'schema_version'");
        unset($pdo, $db, $sets);

        $db = new Database($dir);
        $sets = new SetRepository($db);
        $set = $sets->find($id);
        self::assertSame('8', $db->getMeta('schema_version'));
        self::assertSame(['sheet', '2026-09-28', 'gaur', 'word'], [$set['kind'], $set['receivedOn'], $set['entries'][0]['id'], $set['entries'][0]['type']]);
        $exams = (new \App\Content\ExamRepository($db))->all();
        self::assertSame([['id' => $id, 'title' => 'Week', 'examDate' => '2026-12-01', 'setIds' => [$id], 'status' => 'published']], $exams, 'the exam keeps the set id so old links work');

        // Running the migration again changes nothing.
        $db->pdo()->exec("UPDATE meta SET value = '7' WHERE key = 'schema_version'");
        $again = new Database($dir);
        self::assertCount(1, (new \App\Content\ExamRepository($again))->all());
        self::assertCount(1, (new SetRepository($again))->find($id)['entries']);
    }

    public function testStoriesAreSeededOnceAsDraftsNeedingReview(): void
    {
        $db = new Database($this->tempDir());
        $stories = new \App\Content\StoryRepository($db);
        $seeder = new SampleSeeder($db, new SetRepository($db), new ImportValidator(), $stories, new \App\Content\StoryValidator());
        $dir = \dirname(self::samplePath('hiztegia-1-gaia.json')).'/stories';
        $titles = $seeder->seedStoriesOnce($dir);
        self::assertGreaterThanOrEqual(6, \count($titles));
        $all = $stories->all();
        self::assertGreaterThanOrEqual(4, \count(array_filter($all, static fn (array $s): bool => 'short' === $s['format'])));
        self::assertGreaterThanOrEqual(2, \count(array_filter($all, static fn (array $s): bool => 'extended' === $s['format'])));
        foreach ($all as $story) {
            self::assertSame('draft', $story['status']);
            self::assertTrue($story['needsReview'], $story['id']);
        }
        self::assertSame([], $stories->publishedContent());
        $stories->delete($all[0]['id']);
        self::assertSame([], $seeder->seedStoriesOnce($dir), 'Deleted stories must not come back.');
    }

    public function testStructuredTopicsWaitForReviewAsDrafts(): void
    {
        $db = new Database($this->tempDir());
        $sets = new SetRepository($db);
        $seeder = new SampleSeeder($db, $sets, new ImportValidator());
        $seeder->seedTopicsOnce(\dirname(self::samplePath('hiztegia-1-gaia.json')).'/topics');
        $byTitle = array_column($sets->listSummaries(), null, 'title');
        foreach (['Esaldiak · Frases', 'Gramatika · Gramática'] as $title) {
            self::assertSame('draft', $byTitle[$title]['status'], $title);
            self::assertGreaterThan(0, $byTitle[$title]['reviewCount']);
        }
        self::assertSame('published', $byTitle['ASTEGUNAK']['status']);
    }
}
