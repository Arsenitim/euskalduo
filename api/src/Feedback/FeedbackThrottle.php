<?php

declare(strict_types=1);

namespace App\Feedback;

use App\Content\Database;

/**
 * Per-IP brake on feedback submissions: at most MAX_PER_WINDOW attempts per
 * IP within WINDOW seconds. Rows are deleted once they leave the window, so
 * IPs are kept here for an hour at most. The real guard against floods is
 * the size cap in FeedbackStore; this only keeps one sender from filling it.
 */
final class FeedbackThrottle
{
    public const MAX_PER_WINDOW = 10;
    public const WINDOW = 3600;

    public function __construct(private readonly Database $db)
    {
    }

    /** Records the attempt and says whether it is within the limit. */
    public function attempt(string $ip, ?int $now = null): bool
    {
        $now ??= time();
        $pdo = $this->db->pdo();
        $pdo->prepare('DELETE FROM feedback_throttle WHERE at <= ?')->execute([$now - self::WINDOW]);
        $count = $pdo->prepare('SELECT COUNT(*) FROM feedback_throttle WHERE ip = ?');
        $count->execute([$ip]);
        if ((int) $count->fetchColumn() >= self::MAX_PER_WINDOW) {
            return false;
        }
        $pdo->prepare('INSERT INTO feedback_throttle(ip, at) VALUES (?, ?)')->execute([$ip, $now]);

        return true;
    }
}
