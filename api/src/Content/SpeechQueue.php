<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Tells the speech worker which texts need clips, drafts included, so story
 * audio exists before an admin publishes. The list is a file in a volume
 * that only this API writes and the worker only reads: no endpoint, no
 * network access to the database. Synthesis never runs in a web request.
 */
final class SpeechQueue
{
    public const FILE = 'requests.json';

    public function __construct(
        private readonly string $speechDir,
        private readonly SetRepository $sets,
        private readonly StoryRepository $stories,
    ) {
    }

    /** @return bool false when the queue directory is not available (e.g. tests, no worker) */
    public function refresh(): bool
    {
        if (!is_dir($this->speechDir) || !is_writable($this->speechDir)) {
            return false;
        }
        $texts = array_values(array_unique([...$this->sets->speechTexts(), ...$this->stories->transcripts()]));
        sort($texts);
        $target = $this->speechDir.'/'.self::FILE;
        $temporary = $target.'.'.bin2hex(random_bytes(4)).'.tmp';
        $json = json_encode(['texts' => $texts], \JSON_THROW_ON_ERROR | \JSON_UNESCAPED_UNICODE);
        if (false === file_put_contents($temporary, $json)) {
            return false;
        }
        chmod($temporary, 0644);

        return rename($temporary, $target);
    }
}
