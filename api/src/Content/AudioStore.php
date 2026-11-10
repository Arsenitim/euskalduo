<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Shares the exact profile bytes and key contract with the offline worker.
 *
 * A clip's name is a hash of the voice profile and the exact text, so an
 * edited text (or a changed voice profile) never matches an old clip. Next
 * to each clip the worker writes "<key>.json" with the measured duration,
 * and it records failed texts in "status.json". This side only reads.
 */
final class AudioStore
{
    private ?string $profileHash = null;
    /** @var array<string, mixed>|null */
    private ?array $status = null;

    public function __construct(private readonly string $audioDir, private readonly string $profilePath)
    {
    }

    public function key(string $text): string
    {
        $this->profileHash ??= hash_file('sha256', $this->profilePath) ?: throw new \RuntimeException('Cannot read speech profile.');

        return hash('sha256', $this->profileHash."\0".$text);
    }

    public function url(string $text): ?string
    {
        $name = $this->key($text).'.mp3';
        $path = $this->audioDir.'/'.$name;

        return is_file($path) && filesize($path) > 0 ? '/audio/'.$name : null;
    }

    /** Measured length of the clip for exactly this text, or null if there is none. */
    public function durationMs(string $text): ?int
    {
        if (null === $this->url($text)) {
            return null;
        }
        $path = $this->audioDir.'/'.$this->key($text).'.json';
        if (!is_file($path)) {
            return null;
        }
        $data = json_decode((string) file_get_contents($path), true);
        $ms = \is_array($data) ? ($data['durationMs'] ?? null) : null;

        return \is_int($ms) && $ms > 0 ? $ms : null;
    }

    /** The worker's last error for this text, if generation failed. */
    public function failure(string $text): ?string
    {
        if (null === $this->status) {
            $path = $this->audioDir.'/status.json';
            $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
            $this->status = \is_array($data) ? $data : [];
        }
        $failure = $this->status['failed'][$this->key($text)] ?? null;

        return \is_array($failure) && \is_string($failure['message'] ?? null) ? mb_substr($failure['message'], 0, 200) : null;
    }
}
