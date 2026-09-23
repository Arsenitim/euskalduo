<?php

declare(strict_types=1);

namespace App\Security;

use App\Content\Database;

/**
 * Global (not per-IP) brake on failed admin logins, so no visitor IPs need
 * to be stored. After MAX_FAILURES failures inside WINDOW seconds further
 * attempts are refused until the window expires.
 */
final class LoginThrottle
{
    public const MAX_FAILURES = 10;
    public const WINDOW = 900;

    public function __construct(private readonly Database $db)
    {
    }

    public function isLocked(?int $now = null): bool
    {
        $now ??= time();
        $row = $this->row();

        return null !== $row && $now - $row['window_start'] < self::WINDOW && $row['failures'] >= self::MAX_FAILURES;
    }

    public function recordFailure(?int $now = null): void
    {
        $now ??= time();
        $row = $this->row();
        if (null === $row || $now - $row['window_start'] >= self::WINDOW) {
            $this->db->pdo()->prepare('INSERT INTO login_throttle(id, failures, window_start) VALUES (1, 1, ?) ON CONFLICT(id) DO UPDATE SET failures = 1, window_start = excluded.window_start')->execute([$now]);

            return;
        }
        $this->db->pdo()->exec('UPDATE login_throttle SET failures = failures + 1 WHERE id = 1');
    }

    public function reset(): void
    {
        $this->db->pdo()->exec('DELETE FROM login_throttle');
    }

    /** @return array{failures: int, window_start: int}|null */
    private function row(): ?array
    {
        $row = $this->db->pdo()->query('SELECT failures, window_start FROM login_throttle WHERE id = 1')->fetch();

        return false === $row ? null : ['failures' => (int) $row['failures'], 'window_start' => (int) $row['window_start']];
    }
}
