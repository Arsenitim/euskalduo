<?php

declare(strict_types=1);

namespace App\Feedback;

use App\Content\ImageStore;

/**
 * Learner feedback as plain files: <id>.json per message plus an optional
 * <id>.webp screenshot. Ids are UUIDv7, so a directory listing is in
 * arrival order. The directory has a hard size cap; once it is reached new
 * feedback is refused until old entries are downloaded and purged.
 */
final class FeedbackStore
{
    public const SCREENSHOT_SIDE = 1600;
    private const ID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';

    private readonly string $dir;
    private readonly int $maxBytes;

    public function __construct(string $dataDir, int $maxMegabytes)
    {
        $this->dir = $dataDir.'/feedback';
        $this->maxBytes = $maxMegabytes * 1024 * 1024;
    }

    public function dir(): string
    {
        return $this->dir;
    }

    public function usedBytes(): int
    {
        $total = 0;
        foreach (glob($this->dir.'/*') ?: [] as $file) {
            $total += (int) @filesize($file);
        }

        return $total;
    }

    public function hasRoomFor(int $bytes): bool
    {
        return $this->usedBytes() + $bytes <= $this->maxBytes;
    }

    /**
     * @param array{name: ?string, message: string, page: ?string, viewport: ?string, userAgent: ?string, ip: ?string} $fields
     *
     * @throws \InvalidArgumentException when the screenshot is not a usable image
     */
    public function add(array $fields, ?string $screenshotPath, ?int $now = null): string
    {
        $this->ensureDir();
        $id = self::uuid7($now);
        $screenshot = null;
        if (null !== $screenshotPath) {
            $images = new ImageStore($this->dir, self::SCREENSHOT_SIDE);
            $screenshot = $id.'.webp';
            rename($this->dir.'/'.$images->store($screenshotPath), $this->dir.'/'.$screenshot);
        }

        $record = [
            'id' => $id,
            'receivedAt' => gmdate('Y-m-d\TH:i:s\Z', $now ?? time()),
            'ip' => $fields['ip'],
            'name' => $fields['name'],
            'message' => $fields['message'],
            'screenshot' => $screenshot,
            'page' => $fields['page'],
            'viewport' => $fields['viewport'],
            'userAgent' => $fields['userAgent'],
        ];
        // Written last and renamed into place: a .json file is always complete.
        $tmp = $this->dir.'/.'.$id.'.json.tmp';
        file_put_contents($tmp, json_encode($record, \JSON_PRETTY_PRINT | \JSON_UNESCAPED_UNICODE | \JSON_UNESCAPED_SLASHES | \JSON_THROW_ON_ERROR)."\n");
        rename($tmp, $this->dir.'/'.$id.'.json');

        return $id;
    }

    /** @return list<string> ids, oldest first */
    public function ids(): array
    {
        $ids = [];
        foreach (glob($this->dir.'/*.json') ?: [] as $file) {
            $ids[] = basename($file, '.json');
        }
        sort($ids);

        return $ids;
    }

    /** Deletes every entry up to and including $lastId. Returns how many. */
    public function purgeThrough(string $lastId): int
    {
        if (!preg_match(self::ID_PATTERN, $lastId)) {
            throw new \InvalidArgumentException('Not a feedback id.');
        }
        $count = 0;
        foreach ($this->ids() as $id) {
            if (strcmp($id, $lastId) > 0) {
                break;
            }
            @unlink($this->dir.'/'.$id.'.webp');
            unlink($this->dir.'/'.$id.'.json');
            ++$count;
        }

        return $count;
    }

    private static function uuid7(?int $now): string
    {
        $ms = null === $now ? (int) floor(microtime(true) * 1000) : $now * 1000;
        $bytes = substr(pack('J', $ms), 2).random_bytes(10);
        $bytes[6] = \chr(0x70 | (\ord($bytes[6]) & 0x0F));
        $bytes[8] = \chr(0x80 | (\ord($bytes[8]) & 0x3F));
        $hex = bin2hex($bytes);

        return substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'.substr($hex, 16, 4).'-'.substr($hex, 20);
    }

    private function ensureDir(): void
    {
        if (!is_dir($this->dir) && !mkdir($this->dir, 0755, true) && !is_dir($this->dir)) {
            throw new \RuntimeException('Cannot create feedback directory.');
        }
    }
}
