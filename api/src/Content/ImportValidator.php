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
    public const SCHEMA_VERSION = 1;
    public const LANGUAGES = ['es', 'ru'];
    public const KINDS = ['week', 'topic'];

    private const MAX_ENTRIES = 300;
    private const MAX_GROUPS = 20;
    private const MAX_ALTERNATIVES = 8;
    private const ID_PATTERN = '/^[a-z0-9][a-z0-9_-]{0,39}$/';

    private const TOP_KEYS = ['schemaVersion', 'kind', 'title', 'weekStart', 'description', 'groups', 'entries'];
    private const ENTRY_KEYS = ['id', 'basque', 'translations', 'note', 'imageHint', 'emoji', 'group', 'needsReview', 'reviewNote'];

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
            if (($input['schemaVersion'] ?? null) !== self::SCHEMA_VERSION) {
                $this->error('schemaVersion', null, \sprintf('schemaVersion must be %d.', self::SCHEMA_VERSION));
            }
        }
        foreach (array_keys($input) as $key) {
            if (!\in_array($key, self::TOP_KEYS, true)) {
                $this->warning((string) $key, null, \sprintf('Unknown field "%s" was ignored.', $key));
            }
        }

        $title = $this->text($input['title'] ?? null, 'title', null, 120, required: true);
        $description = $this->text($input['description'] ?? null, 'description', null, 500);
        $kind = $this->kind($input['kind'] ?? null);
        $weekStart = $this->weekStart($input['weekStart'] ?? null);
        if ('topic' === $kind && null !== $weekStart) {
            $this->warning('weekStart', null, 'Categories have no homework week; weekStart was ignored.');
            $weekStart = null;
        }
        $groups = $this->groups($input['groups'] ?? []);
        $entries = $this->entries($input['entries'] ?? null, array_column($groups, 'key'));

        $draft = [
            'kind' => $kind,
            'title' => $title ?? '',
            'weekStart' => $weekStart,
            'description' => $description,
            'groups' => $groups,
            'entries' => $entries,
        ];

        return new ValidationResult($draft, $this->errors, $this->warnings);
    }

    /** "week" (homework for a given week, the default) or "topic" (a category such as the months). */
    private function kind(mixed $value): string
    {
        if (null === $value) {
            return 'week';
        }
        if (!\in_array($value, self::KINDS, true)) {
            $this->error('kind', null, 'kind must be "week" or "topic".');

            return 'week';
        }

        return $value;
    }

    private function weekStart(mixed $value): ?string
    {
        if (null === $value || '' === $value) {
            return null;
        }
        if (!\is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            $this->error('weekStart', null, 'weekStart must be an ISO date (YYYY-MM-DD) or null.');

            return null;
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, new \DateTimeZone('UTC'));
        if (false === $date || $date->format('Y-m-d') !== $value) {
            $this->error('weekStart', null, 'weekStart is not a real calendar date.');

            return null;
        }
        if ('1' !== $date->format('N')) {
            $this->warning('weekStart', null, 'weekStart is not a Monday; it will be shown as “week of” this date.');
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

            $basque = $this->text($raw['basque'] ?? null, "$path.basque", $i, 80, required: true);
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

            $entry = [
                'id' => $id,
                'basque' => $basque ?? '',
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
