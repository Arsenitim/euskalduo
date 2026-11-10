<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Content\AudioStore;
use App\Tests\TempDirs;
use PHPUnit\Framework\TestCase;

final class AudioStoreTest extends TestCase
{
    use TempDirs;

    protected function tearDown(): void { $this->removeTempDirs(); }

    public function testSharedHashAndAvailability(): void
    {
        $dir = $this->tempDir();
        $profile = self::profilePath();
        $store = new AudioStore($dir, $profile);
        self::assertSame('c6696f480ff6ca888a8e8952e8cfdecd1007dbcb357f13baf39b3c02647823f3', $store->key('Kaixo'));
        self::assertNull($store->url('Kaixo'));
        $file = $dir.'/'.$store->key('Kaixo').'.mp3';
        file_put_contents($file, '');
        self::assertNull($store->url('Kaixo'));
        file_put_contents($file, 'clip');
        clearstatcache();
        self::assertSame('/audio/'.$store->key('Kaixo').'.mp3', $store->url('Kaixo'));
        self::assertNull($store->url('Kaixo!'));
    }

    public function testDurationOnlyForTheExactTextAndFailuresAreReported(): void
    {
        $dir = $this->tempDir();
        $store = new AudioStore($dir, self::profilePath());
        $key = $store->key('Triku etxera doa.');
        file_put_contents("$dir/$key.json", json_encode(['durationMs' => 31500]));
        self::assertNull($store->durationMs('Triku etxera doa.'), 'no clip, no duration');
        file_put_contents("$dir/$key.mp3", 'clip');
        self::assertSame(31500, $store->durationMs('Triku etxera doa.'));
        self::assertNull($store->durationMs('Triku eskolara doa.'), 'an edited text never matches the old clip');

        $other = $store->key('Txapi');
        file_put_contents("$dir/status.json", json_encode(['failed' => [$other => ['at' => 'x', 'message' => 'RuntimeError: boom']]]));
        $fresh = new AudioStore($dir, self::profilePath());
        self::assertSame('RuntimeError: boom', $fresh->failure('Txapi'));
        self::assertNull($fresh->failure('Triku etxera doa.'));
    }

    private static function profilePath(): string
    {
        foreach (['/../../tts/profile.json', '/../../../tts/profile.json'] as $relative) {
            if (is_file(__DIR__.$relative)) {
                return __DIR__.$relative;
            }
        }
        self::fail('tts/profile.json not found');
    }
}
