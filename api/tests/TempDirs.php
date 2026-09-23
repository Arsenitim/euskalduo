<?php

declare(strict_types=1);

namespace App\Tests;

trait TempDirs
{
    /** @var list<string> */
    private array $tempDirs = [];

    private function tempDir(): string
    {
        $dir = sys_get_temp_dir().'/euskalduo-test-'.bin2hex(random_bytes(6));
        mkdir($dir, 0777, true);
        $this->tempDirs[] = $dir;

        return $dir;
    }

    private function removeTempDirs(): void
    {
        foreach ($this->tempDirs as $dir) {
            exec('rm -rf '.escapeshellarg($dir));
        }
        $this->tempDirs = [];
    }

    private static function samplePath(string $file): string
    {
        foreach ([__DIR__.'/../samples/', __DIR__.'/../../samples/'] as $dir) {
            if (is_file($dir.$file)) {
                return $dir.$file;
            }
        }
        throw new \RuntimeException("Sample $file not found");
    }
}
