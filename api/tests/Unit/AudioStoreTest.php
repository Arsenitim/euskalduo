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
        $profile = is_file(__DIR__.'/../../../tts/profile.json') ? __DIR__.'/../../../tts/profile.json' : __DIR__.'/../../../../tts/profile.json';
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
}
