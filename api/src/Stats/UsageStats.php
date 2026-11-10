<?php

declare(strict_types=1);

namespace App\Stats;

use App\Content\Database;

/**
 * Anonymous usage counters: one row of totals per day, plus the same answer
 * and round counters per day broken down by a few fixed dimensions (which
 * homework set, which exercise type, which practice mode, online/offline,
 * installed app/browser). No IP, no device id, no per-learner rows. Browsers
 * report "new device", "first practice today" and "first practice this
 * week" as yes/no flags (they remember locally that they already did).
 */
final class UsageStats
{
    public const COUNTERS = ['new_devices', 'active_devices', 'answers', 'correct', 'hinted', 'wrong', 'skipped', 'rounds', 'weekly_devices'];
    public const BREAKDOWN_COUNTERS = ['answers', 'correct', 'hinted', 'wrong', 'skipped', 'rounds'];

    /** The only keys each dimension accepts ('set' takes ids of existing sets instead). */
    public const DIMENSIONS = [
        'set' => null,
        'exercise' => ['meaning-choice', 'basque-choice', 'spell', 'type-meaning', 'word-build', 'order'],
        'mode' => ['week', 'topic', 'exam', 'mix'],
        'connection' => ['online', 'offline'],
        'display' => ['app', 'browser'],
    ];

    public function __construct(private readonly Database $db)
    {
    }

    /** @param array<string, int> $deltas counter => amount to add */
    public function add(array $deltas, ?string $day = null): void
    {
        $deltas = array_filter(array_intersect_key($deltas, array_flip(self::COUNTERS)));
        if ([] === $deltas) {
            return;
        }
        $columns = array_keys($deltas);
        $sql = \sprintf(
            'INSERT INTO usage_daily (day, %s) VALUES (?, %s) ON CONFLICT(day) DO UPDATE SET %s',
            implode(', ', $columns),
            implode(', ', array_fill(0, \count($columns), '?')),
            implode(', ', array_map(static fn (string $c): string => "$c = $c + excluded.$c", $columns)),
        );
        $this->db->pdo()->prepare($sql)->execute([$day ?? gmdate('Y-m-d'), ...array_values($deltas)]);
    }

    /**
     * Adds to one breakdown row. Unknown dimensions or keys (and sets that do
     * not exist) are ignored, so the table only ever holds the fixed labels
     * above and real set ids.
     *
     * @param array<string, int> $deltas counter => amount to add
     */
    public function addBreakdown(string $dimension, string $key, array $deltas, ?string $day = null): void
    {
        if (!$this->acceptsKey($dimension, $key)) {
            return;
        }
        $deltas = array_filter(array_intersect_key($deltas, array_flip(self::BREAKDOWN_COUNTERS)));
        if ([] === $deltas) {
            return;
        }
        $columns = array_keys($deltas);
        $sql = \sprintf(
            'INSERT INTO usage_breakdown (day, dimension, key, %s) VALUES (?, ?, ?, %s) ON CONFLICT(day, dimension, key) DO UPDATE SET %s',
            implode(', ', $columns),
            implode(', ', array_fill(0, \count($columns), '?')),
            implode(', ', array_map(static fn (string $c): string => "$c = $c + excluded.$c", $columns)),
        );
        $this->db->pdo()->prepare($sql)->execute([$day ?? gmdate('Y-m-d'), $dimension, $key, ...array_values($deltas)]);
    }

    /** Runs $fn in one transaction, so a request's counters land together. */
    public function transaction(callable $fn): void
    {
        $pdo = $this->db->pdo();
        $pdo->beginTransaction();
        try {
            $fn();
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    private function acceptsKey(string $dimension, string $key): bool
    {
        if (!\array_key_exists($dimension, self::DIMENSIONS)) {
            return false;
        }
        $keys = self::DIMENSIONS[$dimension];
        if (null !== $keys) {
            return \in_array($key, $keys, true);
        }
        $stmt = $this->db->pdo()->prepare('SELECT 1 FROM homework_sets WHERE id = ?');
        $stmt->execute([$key]);

        return false !== $stmt->fetchColumn();
    }

    /**
     * @return array{
     *     totals: array<string, int>,
     *     days: list<array<string, int|string>>,
     *     weeks: list<array<string, int|string>>,
     *     breakdown: array<string, list<array<string, int|string|null>>>
     * } the last $days days (UTC), newest first, gaps filled with zeros; the
     *   last $weeks weeks (Monday to Sunday, UTC), newest first; and each
     *   dimension's totals over those $days days, busiest first
     */
    public function report(int $days = 30, ?string $today = null, int $weeks = 8): array
    {
        $pdo = $this->db->pdo();
        $totals = $pdo->query('SELECT '.implode(', ', array_map(static fn (string $c): string => "COALESCE(SUM($c), 0) AS $c", self::COUNTERS)).' FROM usage_daily')->fetch();

        $utc = new \DateTimeZone('UTC');
        $end = new \DateTimeImmutable($today ?? gmdate('Y-m-d'), $utc);
        $start = $end->modify('-'.($days - 1).' days')->format('Y-m-d');
        $stmt = $pdo->prepare('SELECT * FROM usage_daily WHERE day >= ?');
        $stmt->execute([$start]);
        $rows = array_column($stmt->fetchAll(), null, 'day');

        $list = [];
        for ($i = 0; $i < $days; ++$i) {
            $day = $end->modify("-$i days")->format('Y-m-d');
            $row = ['day' => $day];
            foreach (self::COUNTERS as $c) {
                $row[$c] = (int) ($rows[$day][$c] ?? 0);
            }
            $list[] = $row;
        }

        return [
            'totals' => array_map('intval', $totals),
            'days' => $list,
            'weeks' => $this->weeks($end, $weeks),
            'breakdown' => $this->breakdown($start),
        ];
    }

    /** @return list<array<string, int|string>> */
    private function weeks(\DateTimeImmutable $end, int $count): array
    {
        $monday = $end->modify('-'.((int) $end->format('N') - 1).' days');
        $first = $monday->modify('-'.($count - 1).' weeks');
        $stmt = $this->db->pdo()->prepare('SELECT * FROM usage_daily WHERE day >= ? AND day <= ?');
        $stmt->execute([$first->format('Y-m-d'), $end->format('Y-m-d')]);
        $sums = [];
        foreach ($stmt->fetchAll() as $row) {
            $day = new \DateTimeImmutable($row['day'], $end->getTimezone());
            $week = $day->modify('-'.((int) $day->format('N') - 1).' days')->format('Y-m-d');
            foreach (['weekly_devices', 'answers', 'rounds', 'new_devices'] as $c) {
                $sums[$week][$c] = ($sums[$week][$c] ?? 0) + (int) $row[$c];
            }
        }
        $list = [];
        for ($i = 0; $i < $count; ++$i) {
            $week = $monday->modify("-$i weeks")->format('Y-m-d');
            $list[] = ['week' => $week] + array_map('intval', $sums[$week] ?? ['weekly_devices' => 0, 'answers' => 0, 'rounds' => 0, 'new_devices' => 0]);
        }

        return $list;
    }

    /** @return array<string, list<array<string, int|string|null>>> */
    private function breakdown(string $start): array
    {
        $sums = implode(', ', array_map(static fn (string $c): string => "SUM(b.$c) AS $c", self::BREAKDOWN_COUNTERS));
        $stmt = $this->db->pdo()->prepare(
            "SELECT b.dimension, b.key, s.title, $sums FROM usage_breakdown b
             LEFT JOIN homework_sets s ON b.dimension = 'set' AND s.id = b.key
             WHERE b.day >= ? GROUP BY b.dimension, b.key ORDER BY answers DESC, rounds DESC, b.key",
        );
        $stmt->execute([$start]);
        $out = array_fill_keys(array_keys(self::DIMENSIONS), []);
        foreach ($stmt->fetchAll() as $row) {
            $item = ['key' => $row['key']];
            if ('set' === $row['dimension']) {
                $item['title'] = $row['title'];
            }
            foreach (self::BREAKDOWN_COUNTERS as $c) {
                $item[$c] = (int) $row[$c];
            }
            $out[$row['dimension']][] = $item;
        }

        return $out;
    }
}
