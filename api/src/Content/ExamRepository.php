<?php

declare(strict_types=1);

namespace App\Content;

/**
 * An exam is a named selection of sets (sheets or topics) with an optional
 * date. It only adds a focused practice section for learners; the material
 * stays in ordinary practice too.
 */
final class ExamRepository
{
    private const ID_PATTERN = '/^[a-z0-9][a-z0-9_-]{0,39}$/';

    public function __construct(private readonly Database $db)
    {
    }

    /** @return list<array<string, mixed>> */
    public function all(): array
    {
        $rows = $this->db->pdo()->query('SELECT * FROM exams ORDER BY exam_date IS NULL, exam_date, title COLLATE NOCASE')->fetchAll();

        return array_map(self::exam(...), $rows);
    }

    /** @return array<string, mixed>|null */
    public function find(string $id): ?array
    {
        $stmt = $this->db->pdo()->prepare('SELECT * FROM exams WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return false === $row ? null : self::exam($row);
    }

    /**
     * Published exams with at least one published set, for the catalogue.
     * Learners hide an exam once its date has passed (they know their date).
     *
     * @param list<string> $publishedSetIds
     *
     * @return list<array<string, mixed>>
     */
    public function publishedContent(array $publishedSetIds): array
    {
        $result = [];
        foreach ($this->all() as $exam) {
            $setIds = array_values(array_intersect($exam['setIds'], $publishedSetIds));
            if ('published' !== $exam['status'] || [] === $setIds) {
                continue;
            }
            $result[] = ['id' => $exam['id'], 'title' => $exam['title'], 'examDate' => $exam['examDate'], 'setIds' => $setIds];
        }

        return $result;
    }

    /**
     * Validates an editor submission.
     *
     * @param list<string> $existingSetIds
     *
     * @return array{draft: ?array<string, mixed>, errors: list<string>}
     */
    public static function validate(mixed $input, array $existingSetIds): array
    {
        $errors = [];
        if (!\is_array($input) || array_is_list($input)) {
            return ['draft' => null, 'errors' => ['The exam must be a JSON object.']];
        }
        $title = null;
        try {
            $title = \is_string($input['title'] ?? null) ? TextNormalizer::clean($input['title']) : '';
        } catch (\InvalidArgumentException $e) {
            $errors[] = 'Title: '.$e->getMessage();
        }
        if ('' === $title || mb_strlen((string) $title) > 120) {
            $errors[] = 'A title of 1–120 characters is required.';
        }
        $date = $input['examDate'] ?? null;
        if (null !== $date && '' !== $date) {
            $parsed = \is_string($date) ? \DateTimeImmutable::createFromFormat('!Y-m-d', $date, new \DateTimeZone('UTC')) : false;
            if (false === $parsed || $parsed->format('Y-m-d') !== $date) {
                $errors[] = 'The date must be YYYY-MM-DD or empty.';
            }
        } else {
            $date = null;
        }
        $setIds = $input['setIds'] ?? null;
        if (!\is_array($setIds) || !array_is_list($setIds) || [] === $setIds) {
            $errors[] = 'Choose at least one sheet or topic.';
            $setIds = [];
        }
        foreach ($setIds as $id) {
            if (!\is_string($id) || !\in_array($id, $existingSetIds, true)) {
                $errors[] = 'Unknown set in the selection.';
                break;
            }
        }
        $id = $input['id'] ?? null;
        if (null !== $id && (!\is_string($id) || !preg_match(self::ID_PATTERN, $id))) {
            $errors[] = 'Invalid id.';
        }

        return ['draft' => [] === $errors ? ['id' => $id, 'title' => $title, 'examDate' => $date, 'setIds' => array_values(array_unique($setIds))] : null, 'errors' => $errors];
    }

    /** @param array<string, mixed> $draft */
    public function create(array $draft): string
    {
        do {
            $id = 'x'.bin2hex(random_bytes(5));
        } while (null !== $this->find($id));
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $this->db->pdo()->prepare("INSERT INTO exams (id, title, exam_date, set_ids_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)")
            ->execute([$id, $draft['title'], $draft['examDate'], json_encode($draft['setIds']), $now, $now]);

        return $id;
    }

    /** @param array<string, mixed> $draft */
    public function update(string $id, array $draft): void
    {
        $this->db->pdo()->prepare('UPDATE exams SET title = ?, exam_date = ?, set_ids_json = ?, updated_at = ? WHERE id = ?')
            ->execute([$draft['title'], $draft['examDate'], json_encode($draft['setIds']), gmdate('Y-m-d\TH:i:s\Z'), $id]);
    }

    public function setStatus(string $id, string $status): void
    {
        $this->db->pdo()->prepare('UPDATE exams SET status = ?, updated_at = ? WHERE id = ?')->execute([$status, gmdate('Y-m-d\TH:i:s\Z'), $id]);
    }

    public function delete(string $id): void
    {
        $this->db->pdo()->prepare('DELETE FROM exams WHERE id = ?')->execute([$id]);
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private static function exam(array $row): array
    {
        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'examDate' => $row['exam_date'],
            'setIds' => json_decode($row['set_ids_json'], true, 4, \JSON_THROW_ON_ERROR),
            'status' => $row['status'],
        ];
    }
}
