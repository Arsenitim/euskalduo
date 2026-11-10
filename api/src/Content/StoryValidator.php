<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Validates an untrusted listening story (import JSON or an editor save)
 * into the canonical draft shape. Like ImportValidator, nothing is guessed:
 * every correct answer is an explicit option index.
 *
 * Duration targets are product targets for this app, not age-based
 * standards. They are checked against the measured length of the generated
 * audio (see publishBlockers), never estimated from word counts.
 */
final class StoryValidator
{
    public const FORMATS = ['short', 'extended'];
    public const QUESTION_COUNT = ['short' => [1, 2], 'extended' => [3, 5]];
    /** Hard limits for publishing, in milliseconds. */
    public const DURATION_LIMITS = ['short' => [15000, 50000], 'extended' => [40000, 130000]];
    /** Targets; outside them the admin sees a warning, not a blocker. */
    public const DURATION_TARGETS = ['short' => [20000, 40000], 'extended' => [60000, 90000]];
    /** Beginner (difficulty 1) extended stories may be shorter. */
    public const BEGINNER_EXTENDED_MIN = 45000;

    private const ID_PATTERN = '/^[a-z0-9][a-z0-9_-]{0,39}$/';
    private const ENTRY_KEY = '/^[a-z0-9_-]{1,40}\/[a-z0-9_-]{1,40}$/';
    private const TOP_KEYS = ['schemaVersion', 'type', 'id', 'title', 'format', 'difficulty', 'transcript', 'translations', 'questions', 'links', 'needsReview', 'reviewNote'];

    /** @var list<array{path: string, entry: ?int, message: string}> */
    private array $errors = [];
    /** @var list<array{path: string, entry: ?int, message: string}> */
    private array $warnings = [];

    public function validate(mixed $input, bool $requireSchemaVersion = true): ValidationResult
    {
        $this->errors = [];
        $this->warnings = [];
        if (!\is_array($input) || array_is_list($input)) {
            $this->error('', null, 'The document must be a JSON object.');

            return new ValidationResult(null, $this->errors, $this->warnings);
        }
        if ($requireSchemaVersion && 2 !== ($input['schemaVersion'] ?? null)) {
            $this->error('schemaVersion', null, 'schemaVersion must be 2.');
        }
        if ($requireSchemaVersion && 'story' !== ($input['type'] ?? null)) {
            $this->error('type', null, 'type must be "story".');
        }
        foreach (array_keys($input) as $key) {
            if (!\in_array($key, self::TOP_KEYS, true)) {
                $this->warning((string) $key, null, \sprintf('Unknown field "%s" was ignored.', $key));
            }
        }

        $id = $input['id'] ?? null;
        if (null !== $id && (!\is_string($id) || !preg_match(self::ID_PATTERN, $id))) {
            $this->error('id', null, 'id must be lowercase letters, digits, "-" or "_" (max 40).');
            $id = null;
        }
        $format = $input['format'] ?? null;
        if (!\in_array($format, self::FORMATS, true)) {
            $this->error('format', null, 'format must be "short" or "extended".');
            $format = 'short';
        }
        $difficulty = $input['difficulty'] ?? null;
        if (!\is_int($difficulty) || $difficulty < 1 || $difficulty > 3) {
            $this->error('difficulty', null, 'difficulty must be 1 (easy), 2 or 3.');
            $difficulty = 1;
        }
        $needsReview = $input['needsReview'] ?? false;
        if (!\is_bool($needsReview)) {
            $this->error('needsReview', null, 'needsReview must be true or false.');
            $needsReview = true;
        }

        $draft = [
            'id' => $id,
            'title' => $this->text($input['title'] ?? null, 'title', 120, true) ?? '',
            'format' => $format,
            'difficulty' => $difficulty,
            'transcript' => $this->text($input['transcript'] ?? null, 'transcript', 2000, true) ?? '',
            'translations' => $this->translations($input['translations'] ?? null),
            'questions' => $this->questions($input['questions'] ?? null, $format),
            'links' => $this->links($input['links'] ?? null),
            'needsReview' => $needsReview,
            'reviewNote' => $this->text($input['reviewNote'] ?? null, 'reviewNote', 300),
        ];
        if ($needsReview) {
            $this->warning('needsReview', null, 'Flagged for human review'.(null !== $draft['reviewNote'] ? ': '.$draft['reviewNote'] : '.'));
        }

        return new ValidationResult($draft, $this->errors, $this->warnings);
    }

    /**
     * Reasons a story cannot be published yet, and warnings for the admin.
     *
     * @param array<string, mixed> $story      a stored story (see StoryRepository::find)
     * @param array<string, true>  $entryKeys  "setId/entryId" of existing entries
     *
     * @return array{blockers: list<string>, warnings: list<string>}
     */
    public static function publishCheck(array $story, ?int $durationMs, ?string $audioFailure, array $entryKeys): array
    {
        $blockers = [];
        $warnings = [];
        if ($story['needsReview']) {
            $blockers[] = 'The story is flagged for review.';
        }
        if (null === $durationMs) {
            $blockers[] = null !== $audioFailure
                ? 'Audio generation failed: '.$audioFailure
                : 'No audio for the current text yet. The speech worker generates it within a few minutes (docker compose logs tts).';
        } else {
            [$min, $max] = self::DURATION_LIMITS[$story['format']];
            if ($durationMs < $min || $durationMs > $max) {
                $blockers[] = \sprintf('The audio lasts %.0f s; a %s story must last %d–%d s.', $durationMs / 1000, $story['format'], $min / 1000, $max / 1000);
            } else {
                [$low, $high] = self::DURATION_TARGETS[$story['format']];
                if ('extended' === $story['format'] && 1 === $story['difficulty']) {
                    $low = self::BEGINNER_EXTENDED_MIN;
                }
                if ($durationMs < $low || $durationMs > $high) {
                    $warnings[] = \sprintf('The audio lasts %.0f s; the target is %d–%d s.', $durationMs / 1000, $low / 1000, $high / 1000);
                }
            }
        }
        foreach ($story['links']['entries'] as $key) {
            if (!isset($entryKeys[$key])) {
                $blockers[] = \sprintf('Linked entry %s does not exist.', $key);
            }
        }
        [$minQ, $maxQ] = self::QUESTION_COUNT[$story['format']];
        $count = \count($story['questions']);
        if ($count < $minQ || $count > $maxQ) {
            $blockers[] = \sprintf('A %s story needs %d–%d questions.', $story['format'], $minQ, $maxQ);
        }

        return ['blockers' => $blockers, 'warnings' => $warnings];
    }

    /** @return array{es: string, ru: string} */
    private function translations(mixed $value): array
    {
        if (!\is_array($value) || array_is_list($value)) {
            $this->error('translations', null, 'translations must be {"es": "…", "ru": "…"}.');

            return ['es' => '', 'ru' => ''];
        }

        return [
            'es' => $this->text($value['es'] ?? null, 'translations.es', 3000, true) ?? '',
            'ru' => $this->text($value['ru'] ?? null, 'translations.ru', 3000, true) ?? '',
        ];
    }

    /** @return list<array<string, mixed>> */
    private function questions(mixed $value, string $format): array
    {
        if (!\is_array($value) || !array_is_list($value)) {
            $this->error('questions', null, 'questions must be a list.');

            return [];
        }
        [$min, $max] = self::QUESTION_COUNT[$format];
        if (\count($value) < $min || \count($value) > $max) {
            $this->error('questions', null, \sprintf('A %s story needs %d–%d questions.', $format, $min, $max));
        }
        $questions = [];
        $ids = [];
        foreach (\array_slice($value, 0, 5) as $i => $raw) {
            $path = "questions[$i]";
            if (!\is_array($raw) || array_is_list($raw)) {
                $this->error($path, $i, 'Each question must be an object.');
                continue;
            }
            $id = $raw['id'] ?? 'q'.($i + 1);
            if (!\is_string($id) || !preg_match(self::ID_PATTERN, $id) || isset($ids[$id])) {
                $this->error("$path.id", $i, 'Question ids must be unique lowercase ids.');
                $id = 'q'.($i + 1);
            }
            $ids[$id] = true;
            $prompt = $this->localized($raw['prompt'] ?? null, "$path.prompt", $i, 200);
            $options = [];
            $rawOptions = $raw['options'] ?? null;
            if (!\is_array($rawOptions) || !array_is_list($rawOptions) || \count($rawOptions) < 2 || \count($rawOptions) > 4) {
                $this->error("$path.options", $i, 'Each question needs 2–4 options.');
                $rawOptions = [];
            }
            foreach ($rawOptions as $j => $option) {
                $options[] = $this->localized($option, "$path.options[$j]", $i, 120);
            }
            foreach (['es', 'ru'] as $lang) {
                $labels = array_map(static fn (array $o): string => TextNormalizer::matchKey($o[$lang]), $options);
                if (\count(array_unique($labels)) !== \count($labels)) {
                    $this->error("$path.options", $i, \sprintf('Options must be different from each other (%s).', $lang));
                }
            }
            $correct = $raw['correct'] ?? null;
            if (!\is_int($correct) || $correct < 0 || $correct >= max(1, \count($options))) {
                $this->error("$path.correct", $i, 'correct must be the index (0, 1, …) of the right option.');
                $correct = 0;
            }
            $questions[] = ['id' => $id, 'prompt' => $prompt, 'options' => $options, 'correct' => $correct];
        }

        return $questions;
    }

    /** @return array{sets: list<string>, entries: list<string>, words: list<string>, topics: list<string>} */
    private function links(mixed $value): array
    {
        $links = ['sets' => [], 'entries' => [], 'words' => [], 'topics' => []];
        if (null === $value) {
            $this->warning('links', null, 'Link the story to vocabulary or topics so it can be recommended well.');

            return $links;
        }
        if (!\is_array($value) || array_is_list($value)) {
            $this->error('links', null, 'links must be an object.');

            return $links;
        }
        foreach (['sets' => self::ID_PATTERN, 'entries' => self::ENTRY_KEY, 'topics' => self::ID_PATTERN] as $field => $pattern) {
            foreach ((array) ($value[$field] ?? []) as $j => $item) {
                if (!\is_string($item) || !preg_match($pattern, $item)) {
                    $this->error("links.$field[$j]", null, 'Invalid link.');
                    continue;
                }
                $links[$field][] = $item;
            }
        }
        // Basque words the story uses: matched by exact spelling against the
        // catalogue to judge familiarity. Progress is never merged by them.
        foreach ((array) ($value['words'] ?? []) as $j => $word) {
            $text = $this->text($word, "links.words[$j]", 80, true);
            if (null !== $text) {
                $links['words'][] = $text;
            }
        }
        foreach ($links as $field => $list) {
            $links[$field] = array_values(array_unique($list));
        }

        return $links;
    }

    /** @return array{es: string, ru: string} */
    private function localized(mixed $value, string $path, int $index, int $max): array
    {
        if (!\is_array($value) || array_is_list($value)) {
            $this->error($path, $index, 'Must be {"es": "…", "ru": "…"}.');

            return ['es' => '', 'ru' => ''];
        }

        return [
            'es' => $this->text($value['es'] ?? null, "$path.es", $max, true, $index) ?? '',
            'ru' => $this->text($value['ru'] ?? null, "$path.ru", $max, true, $index) ?? '',
        ];
    }

    private function text(mixed $value, string $path, int $max, bool $required = false, ?int $index = null): ?string
    {
        if (null === $value || (\is_string($value) && '' === trim($value))) {
            if ($required) {
                $this->error($path, $index, 'This field is required.');
            }

            return null;
        }
        if (!\is_string($value)) {
            $this->error($path, $index, 'Must be text.');

            return null;
        }
        try {
            $clean = TextNormalizer::clean($value);
        } catch (\InvalidArgumentException $e) {
            $this->error($path, $index, $e->getMessage());

            return null;
        }
        if (mb_strlen($clean) > $max) {
            $this->error($path, $index, \sprintf('Too long (max %d characters).', $max));

            return null;
        }

        return $clean;
    }

    private function error(string $path, ?int $index, string $message): void
    {
        $this->errors[] = ['path' => $path, 'entry' => $index, 'message' => $message];
    }

    private function warning(string $path, ?int $index, string $message): void
    {
        $this->warnings[] = ['path' => $path, 'entry' => $index, 'message' => $message];
    }
}
