<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Validates and normalises an untrusted homework document (import JSON, or a
 * set submitted by the admin editor) into the canonical draft shape.
 *
 * Nothing is guessed: ambiguous input produces an error or a warning for the
 * admin to resolve, never a silent fix-up of the learning content.
 */
final class ImportValidator
{
    /** Version 2 is current; version 1 (homework weeks) is still accepted and normalised. */
    public const SCHEMA_VERSION = 2;
    public const SCHEMA_VERSIONS = [1, 2];
    public const LANGUAGES = ['es', 'ru'];
    /** "sheet": material from school (the old "week"). "topic": a category such as the months. */
    public const KINDS = ['sheet', 'topic'];
    public const ENTRY_TYPES = ['word', 'sentence', 'grammar'];
    /** The gap in a grammar sentence. */
    public const GAP = '___';

    private const MAX_ENTRIES = 300;
    private const MAX_GROUPS = 20;
    private const MAX_ALTERNATIVES = 8;
    private const ID_PATTERN = '/^[a-z0-9][a-z0-9_-]{0,39}$/';

    private const MAX_TILES = 12;
    private const TOP_KEYS = ['schemaVersion', 'type', 'kind', 'title', 'receivedOn', 'weekStart', 'examDate', 'description', 'groups', 'entries'];
    private const ENTRY_KEYS = ['id', 'type', 'basque', 'translations', 'note', 'imageHint', 'emoji', 'group', 'needsReview', 'reviewNote', 'formation', 'sentence', 'grammar'];

    /** @var list<array{path: string, entry: ?int, message: string}> */
    private array $errors = [];
    /** @var list<array{path: string, entry: ?int, message: string}> */
    private array $warnings = [];

    /**
     * @param bool $requireSchemaVersion true for imports, false for editor saves
     */
    public function validate(mixed $input, bool $requireSchemaVersion = true): ValidationResult
    {
        $this->errors = [];
        $this->warnings = [];

        if (!\is_array($input) || array_is_list($input)) {
            $this->error('', null, 'The document must be a JSON object.');

            return new ValidationResult(null, $this->errors, $this->warnings);
        }

        if ($requireSchemaVersion || \array_key_exists('schemaVersion', $input)) {
            if (!\in_array($input['schemaVersion'] ?? null, self::SCHEMA_VERSIONS, true)) {
                $this->error('schemaVersion', null, 'schemaVersion must be 2 (or 1 for older files).');
            }
        }
        if (isset($input['type']) && 'set' !== $input['type']) {
            $this->error('type', null, 'This is not a word set (use the story importer for type "story").');
        }
        foreach (array_keys($input) as $key) {
            if (!\in_array($key, self::TOP_KEYS, true)) {
                $this->warning((string) $key, null, \sprintf('Unknown field "%s" was ignored.', $key));
            }
        }

        $title = $this->text($input['title'] ?? null, 'title', null, 120, required: true);
        $description = $this->text($input['description'] ?? null, 'description', null, 500);
        $kind = $this->kind($input['kind'] ?? null);
        // Older files name the date "weekStart". It is only a record of when the
        // sheet arrived: learning never depends on it.
        $receivedOn = $this->isoDate($input['receivedOn'] ?? null, 'receivedOn');
        if (null === $receivedOn && \array_key_exists('weekStart', $input)) {
            $receivedOn = $this->isoDate($input['weekStart'], 'weekStart');
        }
        if ('topic' === $kind && null !== $receivedOn) {
            $this->warning('receivedOn', null, 'Topics have no date; it was ignored.');
            $receivedOn = null;
        }
        if (null !== ($input['examDate'] ?? null)) {
            $this->warning('examDate', null, 'examDate is no longer part of a set and was ignored. Create an exam under Admin → Exams instead.');
        }
        $groups = $this->groups($input['groups'] ?? []);
        $entries = $this->entries($input['entries'] ?? null, array_column($groups, 'key'));

        $draft = [
            'kind' => $kind,
            'title' => $title ?? '',
            'receivedOn' => $receivedOn,
            'description' => $description,
            'groups' => $groups,
            'entries' => $entries,
        ];

        return new ValidationResult($draft, $this->errors, $this->warnings);
    }

    /** "sheet" (school material, the default; legacy "week") or "topic" (a category such as the months). */
    private function kind(mixed $value): string
    {
        if (null === $value || 'week' === $value) {
            return 'sheet';
        }
        if (!\in_array($value, self::KINDS, true)) {
            $this->error('kind', null, 'kind must be "sheet" or "topic".');

            return 'sheet';
        }

        return $value;
    }

    private function isoDate(mixed $value, string $path): ?string
    {
        if (null === $value || '' === $value) {
            return null;
        }
        if (!\is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            $this->error($path, null, $path.' must be an ISO date (YYYY-MM-DD) or null.');

            return null;
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, new \DateTimeZone('UTC'));
        if (false === $date || $date->format('Y-m-d') !== $value) {
            $this->error($path, null, $path.' is not a real calendar date.');

            return null;
        }

        return $value;
    }

    /**
     * @return list<array{key: string, title: string, ordered: bool}>
     */
    private function groups(mixed $value): array
    {
        if (null === $value) {
            return [];
        }
        if (!\is_array($value) || !array_is_list($value)) {
            $this->error('groups', null, 'groups must be a list.');

            return [];
        }
        if (\count($value) > self::MAX_GROUPS) {
            $this->error('groups', null, \sprintf('At most %d groups are allowed.', self::MAX_GROUPS));

            return [];
        }

        $groups = [];
        foreach ($value as $i => $group) {
            $path = "groups[$i]";
            if (!\is_array($group)) {
                $this->error($path, null, 'Each group must be an object.');
                continue;
            }
            $key = $group['key'] ?? null;
            if (!\is_string($key) || !preg_match(self::ID_PATTERN, $key)) {
                $this->error("$path.key", null, 'Group key must be lowercase letters, digits, "-" or "_" (max 40).');
                continue;
            }
            if (\in_array($key, array_column($groups, 'key'), true)) {
                $this->error("$path.key", null, \sprintf('Duplicate group key "%s".', $key));
                continue;
            }
            $title = $this->text($group['title'] ?? null, "$path.title", null, 60, required: true);
            $ordered = $group['ordered'] ?? false;
            if (!\is_bool($ordered)) {
                $this->error("$path.ordered", null, 'ordered must be true or false.');
                $ordered = false;
            }
            $groups[] = ['key' => $key, 'title' => $title ?? $key, 'ordered' => $ordered];
        }

        return $groups;
    }

    /**
     * @param list<string> $groupKeys
     *
     * @return list<array<string, mixed>>
     */
    private function entries(mixed $value, array $groupKeys): array
    {
        if (!\is_array($value) || !array_is_list($value)) {
            $this->error('entries', null, 'entries must be a list.');

            return [];
        }
        if ([] === $value) {
            $this->error('entries', null, 'A homework set needs at least one entry.');

            return [];
        }
        if (\count($value) > self::MAX_ENTRIES) {
            $this->error('entries', null, \sprintf('At most %d entries are allowed.', self::MAX_ENTRIES));

            return [];
        }

        $entries = [];
        $seenIds = [];
        $seenBasque = [];
        $seenMeaning = [];
        foreach ($value as $i => $raw) {
            $path = "entries[$i]";
            if (!\is_array($raw) || array_is_list($raw)) {
                $this->error($path, $i, 'Each entry must be an object.');
                $raw = [];
            }
            foreach (array_keys($raw) as $key) {
                if (!\in_array($key, self::ENTRY_KEYS, true)) {
                    $this->warning("$path.$key", $i, \sprintf('Unknown field "%s" was ignored.', $key));
                }
            }

            $id = $raw['id'] ?? null;
            if (null !== $id) {
                if (!\is_string($id) || !preg_match(self::ID_PATTERN, $id)) {
                    $this->error("$path.id", $i, 'Entry id must be lowercase letters, digits, "-" or "_" (max 40).');
                    $id = null;
                } elseif (isset($seenIds[$id])) {
                    $this->error("$path.id", $i, \sprintf('Duplicate entry id "%s".', $id));
                    $id = null;
                } else {
                    $seenIds[$id] = true;
                }
            }

            $type = $raw['type'] ?? 'word';
            if (!\in_array($type, self::ENTRY_TYPES, true)) {
                $this->error("$path.type", $i, 'type must be "word", "sentence" or "grammar".');
                $type = 'word';
            }
            $basque = $this->text($raw['basque'] ?? null, "$path.basque", $i, 'word' === $type ? 80 : 160, required: true);
            $translations = $this->translations($raw['translations'] ?? null, "$path.translations", $i);

            $group = $raw['group'] ?? null;
            if (null !== $group && '' !== $group) {
                if (!\is_string($group) || !\in_array($group, $groupKeys, true)) {
                    $this->error("$path.group", $i, 'group must match the key of a group declared in "groups".');
                    $group = null;
                }
            } else {
                $group = null;
            }

            $emoji = $this->emoji($raw['emoji'] ?? null, "$path.emoji", $i);
            $needsReview = $raw['needsReview'] ?? false;
            if (!\is_bool($needsReview)) {
                $this->error("$path.needsReview", $i, 'needsReview must be true or false.');
                $needsReview = true;
            }

            $sentence = 'sentence' === $type ? $this->sentence($raw['sentence'] ?? null, $basque, "$path.sentence", $i) : null;
            $grammar = 'grammar' === $type ? $this->grammar($raw['grammar'] ?? null, $basque, "$path.grammar", $i) : null;
            foreach (['sentence', 'grammar'] as $field) {
                if ($field !== $type && null !== ($raw[$field] ?? null)) {
                    $this->warning("$path.$field", $i, \sprintf('"%s" is only used when type is "%s"; it was ignored.', $field, $field));
                }
            }
            if ('word' !== $type && null !== ($raw['formation'] ?? null)) {
                $this->warning("$path.formation", $i, 'formation is only used for words; it was ignored.');
                $raw['formation'] = null;
            }

            $entry = [
                'id' => $id,
                'type' => $type,
                'sentence' => $sentence,
                'grammar' => $grammar,
                'basque' => $basque ?? '',
                'formation' => $this->formation($raw['formation'] ?? null, "$path.formation", $i),
                'translations' => $translations,
                'note' => $this->text($raw['note'] ?? null, "$path.note", $i, 300),
                'imageHint' => $this->text($raw['imageHint'] ?? null, "$path.imageHint", $i, 200),
                'emoji' => $emoji,
                'group' => $group,
                'needsReview' => $needsReview,
                'reviewNote' => $this->text($raw['reviewNote'] ?? null, "$path.reviewNote", $i, 300),
            ];
            if ($needsReview) {
                $this->warning($path, $i, 'Flagged for human review'.(null !== $entry['reviewNote'] ? ': '.$entry['reviewNote'] : '.'));
            }

            if (null !== $basque) {
                $key = TextNormalizer::matchKey($basque);
                if (isset($seenBasque[$key])) {
                    $this->warning("$path.basque", $i, \sprintf('Duplicate Basque term: same as entry %d.', $seenBasque[$key] + 1));
                } else {
                    $seenBasque[$key] = $i;
                }
            }
            foreach ($translations['es'] ?? [] as $meaning) {
                $key = TextNormalizer::matchKey($meaning);
                if (isset($seenMeaning[$key]) && $seenMeaning[$key] !== $i) {
                    $this->warning("$path.translations.es", $i, \sprintf('“%s” is also a translation of entry %d.', $meaning, $seenMeaning[$key] + 1));
                } else {
                    $seenMeaning[$key] = $i;
                }
            }

            $entries[] = $entry;
        }

        return $entries;
    }

    /**
     * @return array<string, list<string>>
     */
    private function translations(mixed $value, string $path, int $entry): array
    {
        if (!\is_array($value) || array_is_list($value)) {
            $this->error($path, $entry, 'translations must be an object such as {"es": ["…"]}.');

            return ['es' => []];
        }

        $result = [];
        foreach ($value as $lang => $alternatives) {
            if (!\in_array($lang, self::LANGUAGES, true)) {
                $this->error("$path.$lang", $entry, \sprintf('Unsupported language "%s" (allowed: %s).', $lang, implode(', ', self::LANGUAGES)));
                continue;
            }
            if (\is_string($alternatives)) {
                if (preg_match('/[,;\/]/u', $alternatives)) {
                    $this->warning("$path.$lang", $entry, 'This translation contains , ; or / — if these are alternatives, list them separately.');
                }
                $alternatives = [$alternatives];
            }
            if (!\is_array($alternatives) || !array_is_list($alternatives)) {
                $this->error("$path.$lang", $entry, 'Translations must be a list of strings.');
                continue;
            }
            if (\count($alternatives) > self::MAX_ALTERNATIVES) {
                $this->error("$path.$lang", $entry, \sprintf('At most %d alternatives per language.', self::MAX_ALTERNATIVES));
                continue;
            }
            $clean = [];
            $keys = [];
            foreach ($alternatives as $j => $alternative) {
                $text = $this->text($alternative, "{$path}.{$lang}[{$j}]", $entry, 120, required: true);
                if (null === $text) {
                    continue;
                }
                $key = TextNormalizer::matchKey($text);
                if (isset($keys[$key])) {
                    $this->warning("{$path}.{$lang}[{$j}]", $entry, \sprintf('Repeated alternative “%s” was merged.', $text));
                    continue;
                }
                $keys[$key] = true;
                $clean[] = $text;
            }
            if ([] !== $clean) {
                $result[$lang] = $clean;
            }
        }

        if ([] === ($result['es'] ?? [])) {
            $this->error("$path.es", $entry, 'At least one Spanish translation is required.');
            $result['es'] = [];
        }

        return $result;
    }

    /**
     * Sentence building: curated tiles in the correct order (repeats allowed),
     * optional other accepted orders and optional extra tiles that do not
     * belong. Nothing is inferred: every accepted order is listed explicitly.
     *
     * @return array{tiles: list<string>, alternatives: list<list<string>>, distractors: list<string>}|null
     */
    private function sentence(mixed $value, ?string $basque, string $path, int $entry): ?array
    {
        if (!\is_array($value) || array_is_list($value)) {
            $this->error($path, $entry, 'A sentence entry needs "sentence": {"tiles": [...]}.');

            return null;
        }
        $tiles = $this->textList($value['tiles'] ?? null, "$path.tiles", $entry, 2, self::MAX_TILES, 40);
        if (null === $tiles) {
            return null;
        }
        if (null !== $basque && self::sentenceKey(implode(' ', $tiles)) !== self::sentenceKey($basque)) {
            $this->error("$path.tiles", $entry, 'The tiles in order must spell the Basque sentence.');
        }
        $sorted = self::multiset($tiles);
        $alternatives = [];
        $raw = $value['alternatives'] ?? [];
        if (!\is_array($raw) || !array_is_list($raw)) {
            $this->error("$path.alternatives", $entry, 'alternatives must be a list of tile lists.');
            $raw = [];
        }
        $seen = [self::sentenceKey(implode(' ', $tiles)) => true];
        foreach ($raw as $j => $alternative) {
            $list = $this->textList($alternative, "$path.alternatives[$j]", $entry, 2, self::MAX_TILES, 40);
            if (null === $list) {
                continue;
            }
            if (self::multiset($list) !== $sorted) {
                $this->error("$path.alternatives[$j]", $entry, 'Each alternative must use exactly the same tiles as the sentence.');
                continue;
            }
            $key = self::sentenceKey(implode(' ', $list));
            if (isset($seen[$key])) {
                $this->warning("$path.alternatives[$j]", $entry, 'Repeated order was merged.');
                continue;
            }
            $seen[$key] = true;
            $alternatives[] = $list;
        }
        $distractors = [];
        if (null !== ($value['distractors'] ?? null)) {
            $distractors = $this->textList($value['distractors'], "$path.distractors", $entry, 0, 4, 40) ?? [];
            $tileKeys = array_map(TextNormalizer::matchKey(...), $tiles);
            foreach ($distractors as $distractor) {
                if (\in_array(TextNormalizer::matchKey($distractor), $tileKeys, true)) {
                    $this->error("$path.distractors", $entry, \sprintf('“%s” is part of the sentence and cannot be an extra tile.', $distractor));
                }
            }
        }

        return ['tiles' => $tiles, 'alternatives' => $alternatives, 'distractors' => $distractors];
    }

    /**
     * Grammar practice: a curated sentence with one gap ("___"), the accepted
     * fillers and curated wrong ones. The complete sentence ("basque") must be
     * the text with the first accepted answer filled in.
     *
     * @return array{text: string, answers: list<string>, distractors: list<string>}|null
     */
    private function grammar(mixed $value, ?string $basque, string $path, int $entry): ?array
    {
        if (!\is_array($value) || array_is_list($value)) {
            $this->error($path, $entry, 'A grammar entry needs "grammar": {"text": "… ___ …", "answers": [...], "distractors": [...]}.');

            return null;
        }
        $text = $this->text($value['text'] ?? null, "$path.text", $entry, 160, required: true);
        $answers = $this->textList($value['answers'] ?? null, "$path.answers", $entry, 1, 4, 40);
        $distractors = $this->textList($value['distractors'] ?? null, "$path.distractors", $entry, 1, 5, 40);
        if (null === $text || null === $answers || null === $distractors) {
            return null;
        }
        if (1 !== substr_count($text, self::GAP)) {
            $this->error("$path.text", $entry, 'The text must contain exactly one gap written as ___.');

            return null;
        }
        $answerKeys = array_map(TextNormalizer::matchKey(...), $answers);
        foreach ($distractors as $distractor) {
            if (\in_array(TextNormalizer::matchKey($distractor), $answerKeys, true)) {
                $this->error("$path.distractors", $entry, \sprintf('“%s” is also an accepted answer.', $distractor));
            }
        }
        if (\count(array_unique(array_map(TextNormalizer::matchKey(...), $distractors))) !== \count($distractors)) {
            $this->error("$path.distractors", $entry, 'Wrong options must be different from each other.');
        }
        if (null !== $basque && self::sentenceKey(str_replace(self::GAP, $answers[0], $text)) !== self::sentenceKey($basque)) {
            $this->error("$path.text", $entry, 'The text with the first answer filled in must equal the Basque sentence.');
        }

        return ['text' => $text, 'answers' => $answers, 'distractors' => $distractors];
    }

    /** @return list<string>|null */
    private function textList(mixed $value, string $path, int $entry, int $min, int $max, int $maxLength): ?array
    {
        if (!\is_array($value) || !array_is_list($value)) {
            $this->error($path, $entry, 'Must be a list of texts.');

            return null;
        }
        if (\count($value) < $min || \count($value) > $max) {
            $this->error($path, $entry, \sprintf('Needs %d to %d items.', $min, $max));

            return null;
        }
        $result = [];
        foreach ($value as $j => $item) {
            $text = $this->text($item, "{$path}[$j]", $entry, $maxLength, required: true);
            if (null === $text) {
                return null;
            }
            $result[] = $text;
        }

        return $result;
    }

    /** Compares sentences ignoring case, accents and spaces before punctuation. */
    public static function sentenceKey(string $value): string
    {
        return TextNormalizer::matchKey((string) preg_replace('/\s+([.,!?;:])/u', '$1', $value));
    }

    /** @param list<string> $tiles */
    private static function multiset(array $tiles): array
    {
        $keys = array_map(TextNormalizer::matchKey(...), $tiles);
        sort($keys);

        return $keys;
    }

    /** Curated word/stem + word/suffix; never infer morphology from spelling. */
    private function formation(mixed $value, string $path, int $entry): ?array
    {
        if (null === $value) {
            return null;
        }
        if (!\is_array($value) || !\in_array($value['kind'] ?? null, ['compound', 'derived'], true)
            || !\is_array($value['parts'] ?? null) || !array_is_list($value['parts']) || 2 !== \count($value['parts'])) {
            $this->error($path, $entry, 'formation needs kind compound/derived and exactly two parts.');
            return null;
        }
        $parts = [];
        foreach ($value['parts'] as $i => $part) {
            $parts[] = $this->text($part, "$path.parts[$i]", $entry, 40, required: true);
        }
        if (\in_array(null, $parts, true)) {
            return null;
        }
        if ('derived' === $value['kind'] && !str_starts_with($parts[1], '-')) {
            $this->error($path, $entry, 'A derived suffix must start with a hyphen, for example -lari.');
        }
        return ['kind' => $value['kind'], 'parts' => $parts];
    }

    private function emoji(mixed $value, string $path, int $entry): ?string
    {
        if (null === $value || '' === $value) {
            return null;
        }
        if (!\is_string($value) || mb_strlen($value) > 8 || preg_match('/[\p{L}\p{N}\p{C}<>&\s]/u', str_replace(["\u{200D}", "\u{FE0F}"], '', $value))) {
            $this->error($path, $entry, 'emoji must be a short emoji without letters, digits or spaces.');

            return null;
        }

        return $value;
    }

    private function text(mixed $value, string $path, ?int $entry, int $max, bool $required = false): ?string
    {
        if (null === $value || (\is_string($value) && '' === trim($value))) {
            if ($required) {
                $this->error($path, $entry, 'This field is required.');
            }

            return null;
        }
        if (!\is_string($value)) {
            $this->error($path, $entry, 'Must be text.');

            return null;
        }
        try {
            $clean = TextNormalizer::clean($value);
        } catch (\InvalidArgumentException $e) {
            $this->error($path, $entry, $e->getMessage());

            return null;
        }
        if (mb_strlen($clean) > $max) {
            $this->error($path, $entry, \sprintf('Too long (max %d characters).', $max));

            return null;
        }

        return $clean;
    }

    private function error(string $path, ?int $entry, string $message): void
    {
        $this->errors[] = ['path' => $path, 'entry' => $entry, 'message' => $message];
    }

    private function warning(string $path, ?int $entry, string $message): void
    {
        $this->warnings[] = ['path' => $path, 'entry' => $entry, 'message' => $message];
    }
}
