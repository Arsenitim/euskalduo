<?php

declare(strict_types=1);

namespace App\Content;

/** Shares the exact profile bytes and key contract with the offline worker. */
final class AudioStore
{
    private ?string $profileHash = null;

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
}
