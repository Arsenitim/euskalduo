<?php

declare(strict_types=1);

namespace App\Stats;

use App\Content\Database;

/**
 * Anonymous usage counters: one row of totals per day, nothing else. No IP,
 * no device id, no per-learner rows. Browsers report "new device" and
 * "first practice today" as yes/no flags (they remember locally that they
 * already did), plus how many answers and finished rounds to add.
 */
final class UsageStats
{
    public const COUNTERS = ['new_devices', 'active_devices', 'answers', 'correct', 'hinted', 'wrong', 'skipped', 'rounds'];

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
     * @return array{totals: array<string, int>, days: list<array<string, int|string>>}
     *                                              the last $days days (UTC), newest first, gaps filled with zeros
     */
    public function report(int $days = 30, ?string $today = null): array
    {
        $pdo = $this->db->pdo();
        $totals = $pdo->query('SELECT '.implode(', ', array_map(static fn (string $c): string => "COALESCE(SUM($c), 0) AS $c", self::COUNTERS)).' FROM usage_daily')->fetch();

        $end = new \DateTimeImmutable($today ?? gmdate('Y-m-d'), new \DateTimeZone('UTC'));
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

        return ['totals' => array_map('intval', $totals), 'days' => $list];
    }
}
