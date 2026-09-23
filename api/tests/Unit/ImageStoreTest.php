<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Content\ImageStore;
use App\Tests\TempDirs;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ImageStoreTest extends TestCase
{
    use TempDirs;

    private string $uploads;
    private ImageStore $store;

    protected function setUp(): void
    {
        $this->uploads = $this->tempDir();
        $this->store = new ImageStore($this->uploads);
    }

    protected function tearDown(): void
    {
        $this->removeTempDirs();
    }

    public function testPngIsReencodedAsWebpWithoutTrailingData(): void
    {
        $png = self::png(1200, 600)."\n<?php echo 'appended'; ?>";
        $name = $this->store->store($this->file($png));

        self::assertMatchesRegularExpression('/^[a-f0-9]{32}\.webp$/', $name);
        $stored = $this->uploads.'/'.$name;
        $info = getimagesize($stored);
        self::assertSame(\IMAGETYPE_WEBP, $info[2]);
        self::assertSame([800, 400], [$info[0], $info[1]], 'Large images are scaled down.');
        self::assertStringNotContainsString('appended', (string) file_get_contents($stored));
    }

    /** @return iterable<string, array{string}> */
    public static function rejectedUploads(): iterable
    {
        yield 'svg' => ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>'];
        yield 'html named like an image' => ['<html><script>alert(1)</script></html>'];
        yield 'gif' => [base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')];
        yield 'truncated png' => [substr(self::png(10, 10), 0, 40)];
        yield 'empty' => [''];
    }

    #[DataProvider('rejectedUploads')]
    public function testUnsafeOrUnsupportedFilesAreRejected(string $content): void
    {
        try {
            $this->store->store($this->file($content));
            self::fail('Expected the upload to be rejected.');
        } catch (\InvalidArgumentException) {
            self::assertSame([], glob($this->uploads.'/*.webp'));
        }
    }

    public function testDeleteIgnoresPathsOutsideTheUploadDirectory(): void
    {
        $outside = $this->tempDir().'/keep.webp';
        touch($outside);
        $this->store->delete('../'.basename(\dirname($outside)).'/keep.webp');

        self::assertFileExists($outside);
    }

    private function file(string $content): string
    {
        $path = $this->tempDir().'/upload.png';
        file_put_contents($path, $content);

        return $path;
    }

    private static function png(int $w, int $h): string
    {
        $image = imagecreatetruecolor($w, $h);
        imagefill($image, 0, 0, imagecolorallocate($image, 200, 30, 30));
        ob_start();
        imagepng($image);

        return (string) ob_get_clean();
    }
}
