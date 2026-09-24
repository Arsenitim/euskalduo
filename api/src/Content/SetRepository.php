<?php

declare(strict_types=1);

namespace App\Content;

final class SetRepository
{
    public function __construct(private readonly Database $db)
    {
    }

    /** @return list<array<string, mixed>> */
    public function listSummaries(): array
    {
        $rows = $this->db->pdo()->query(<<<'SQL'
            SELECT s.*, COUNT(e.id) AS entry_count,
                   SUM(e.image_file IS NOT NULL) AS image_count,
                   SUM(e.needs_review) AS review_count
            FROM homework_sets s LEFT JOIN entries e ON e.set_id = s.id
            GROUP BY s.id
            ORDER BY s.kind = 'topic', s.week_start IS NULL DESC, s.week_start DESC, s.title
            SQL)->fetchAll();

        return array_map(fn (array $row): array => $this->setHeader($row) + [
            'entryCount' => (int) $row['entry_count'],
            'imageCount' => (int) $row['image_count'],
            'reviewCount' => (int) $row['review_count'],
        ], $rows);
    }

    /** @return array<string, mixed>|null */
    public function find(string $id): ?array
    {
        $stmt = $this->db->pdo()->prepare('SELECT * FROM homework_sets WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (false === $row) {
            return null;
        }

        return $this->setHeader($row) + ['entries' => array_map($this->adminEntry(...), $this->entryRows($id))];
    }

    /**
     * All published sets with entries: weeks newest first, then topics by title. This is the only
     * content learners download; they receive everything in one response so
     * the server never learns which week a child chose to practise.
     *
     * @return list<array<string, mixed>>
     */
    public function publishedContent(): array
    {
        $rows = $this->db->pdo()->query("SELECT * FROM homework_sets WHERE status = 'published' ORDER BY kind = 'topic', week_start DESC, title, created_at DESC")->fetchAll();

        return array_map(function (array $row): array {
            $header = $this->setHeader($row);

            return [
                'id' => $header['id'],
                'kind' => $header['kind'],
                'title' => $header['title'],
                'weekStart' => $header['weekStart'],
                'description' => $header['description'],
                'sample' => $header['sample'],
                'groups' => $header['groups'],
                'entries' => array_map($this->publicEntry(...), $this->entryRows($header['id'])),
            ];
        }, $rows);
    }

    /**
     * @param array<string, mixed> $draft validated draft
     */
    public function create(array $draft, bool $isSample = false): string
    {
        $pdo = $this->db->pdo();
        $id = self::newId();
        $now = self::now();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('INSERT INTO homework_sets (id, kind, title, week_start, description, groups_json, status, is_sample, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$id, $draft['kind'], $draft['title'], $draft['weekStart'], $draft['description'], self::json($draft['groups']), 'draft', (int) $isSample, $now, $now]);
            $this->insertEntries($id, $draft['entries'], []);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return $id;
    }

    /**
     * Replaces the set's content. Entries keep their id (and uploaded image)
     * when the editor sends the id back; that keeps learners' local progress.
     *
     * @param array<string, mixed> $draft validated draft
     *
     * @return list<string> image files that are no longer referenced
     */
    public function update(string $id, array $draft): array
    {
        $pdo = $this->db->pdo();
        $existing = [];
        foreach ($this->entryRows($id) as $row) {
            $existing[$row['id']] = $row['image_file'];
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE homework_sets SET kind = ?, title = ?, week_start = ?, description = ?, groups_json = ?, updated_at = ? WHERE id = ?')
                ->execute([$draft['kind'], $draft['title'], $draft['weekStart'], $draft['description'], self::json($draft['groups']), self::now(), $id]);
            $pdo->prepare('DELETE FROM entries WHERE set_id = ?')->execute([$id]);
            $kept = $this->insertEntries($id, $draft['entries'], $existing);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return array_values(array_filter(
            array_diff_key($existing, array_flip($kept)),
            static fn (?string $file): bool => null !== $file,
        ));
    }

    /** @return list<string> image files of the deleted set */
    public function delete(string $id): array
    {
        $files = array_values(array_filter(array_column($this->entryRows($id), 'image_file')));
        $this->db->pdo()->prepare('DELETE FROM homework_sets WHERE id = ?')->execute([$id]);

        return $files;
    }

    public function setStatus(string $id, string $status): void
    {
        $this->db->pdo()->prepare('UPDATE homework_sets SET status = ?, published_at = CASE WHEN ? = \'published\' THEN ? ELSE published_at END, updated_at = ? WHERE id = ?')
            ->execute([$status, $status, self::now(), self::now(), $id]);
    }

    /** @return string|null previous image file */
    public function setEntryImage(string $setId, string $entryId, ?string $file): ?string
    {
        $stmt = $this->db->pdo()->prepare('SELECT image_file FROM entries WHERE set_id = ? AND id = ?');
        $stmt->execute([$setId, $entryId]);
        $previous = $stmt->fetchColumn();
        $this->db->pdo()->prepare('UPDATE entries SET image_file = ? WHERE set_id = ? AND id = ?')->execute([$file, $setId, $entryId]);
        $this->db->pdo()->prepare('UPDATE homework_sets SET updated_at = ? WHERE id = ?')->execute([self::now(), $setId]);

        return false === $previous ? null : $previous;
    }

    public function entryExists(string $setId, string $entryId): bool
    {
        $stmt = $this->db->pdo()->prepare('SELECT 1 FROM entries WHERE set_id = ? AND id = ?');
        $stmt->execute([$setId, $entryId]);

        return false !== $stmt->fetchColumn();
    }

    /**
     * Reasons a set cannot be published yet (empty when it can).
     *
     * @param array<string, mixed> $set
     *
     * @return list<string>
     */
    public static function publishBlockers(array $set): array
    {
        $blockers = [];
        if ('week' === $set['kind'] && null === $set['weekStart']) {
            $blockers[] = 'Assign the homework week (weekStart) before publishing.';
        }
        if ([] === $set['entries']) {
            $blockers[] = 'The set has no entries.';
        }
        $flagged = \count(array_filter($set['entries'], static fn (array $e): bool => $e['needsReview']));
        if ($flagged > 0) {
            $blockers[] = \sprintf('%d entr%s still flagged for review.', $flagged, 1 === $flagged ? 'y is' : 'ies are');
        }

        return $blockers;
    }

    /**
     * @param list<array<string, mixed>> $entries
     * @param array<string, ?string>     $existingImages
     *
     * @return list<string> ids written
     */
    private function insertEntries(string $setId, array $entries, array $existingImages): array
    {
        $stmt = $this->db->pdo()->prepare('INSERT INTO entries (set_id, id, position, basque, translations_json, note, group_key, emoji, image_hint, image_file, needs_review, review_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $ids = [];
        foreach ($entries as $position => $entry) {
            $entryId = $entry['id'] ?? null;
            if (null === $entryId || \in_array($entryId, $ids, true)) {
                do {
                    $entryId = 'e'.bin2hex(random_bytes(5));
                } while (\in_array($entryId, $ids, true) || \array_key_exists($entryId, $existingImages));
            }
            $ids[] = $entryId;
            $stmt->execute([
                $setId,
                $entryId,
                $position,
                $entry['basque'],
                self::json($entry['translations']),
                $entry['note'],
                $entry['group'],
                $entry['emoji'],
                $entry['imageHint'],
                $existingImages[$entryId] ?? null,
                (int) $entry['needsReview'],
                $entry['reviewNote'],
            ]);
        }

        return $ids;
    }

    /** @return list<array<string, mixed>> */
    private function entryRows(string $setId): array
    {
        $stmt = $this->db->pdo()->prepare('SELECT * FROM entries WHERE set_id = ? ORDER BY position');
        $stmt->execute([$setId]);

        return $stmt->fetchAll();
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function setHeader(array $row): array
    {
        return [
            'id' => $row['id'],
            'kind' => $row['kind'],
            'title' => $row['title'],
            'weekStart' => $row['week_start'],
            'description' => $row['description'],
            'groups' => json_decode($row['groups_json'], true, 8, \JSON_THROW_ON_ERROR),
            'status' => $row['status'],
            'sample' => (bool) $row['is_sample'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'publishedAt' => $row['published_at'],
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function publicEntry(array $row): array
    {
        return [
            'id' => $row['id'],
            'basque' => $row['basque'],
            'translations' => json_decode($row['translations_json'], true, 8, \JSON_THROW_ON_ERROR),
            'note' => $row['note'],
            'group' => $row['group_key'],
            'emoji' => $row['emoji'],
            'image' => null !== $row['image_file'] ? ImageStore::PUBLIC_PREFIX.$row['image_file'] : null,
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function adminEntry(array $row): array
    {
        return $this->publicEntry($row) + [
            'imageHint' => $row['image_hint'],
            'needsReview' => (bool) $row['needs_review'],
            'reviewNote' => $row['review_note'],
        ];
    }

    private static function newId(): string
    {
        return 's'.bin2hex(random_bytes(6));
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }

    private static function json(mixed $value): string
    {
        return json_encode($value, \JSON_THROW_ON_ERROR | \JSON_UNESCAPED_UNICODE);
    }
}
