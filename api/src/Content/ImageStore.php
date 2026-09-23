<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Stores entry pictures. Uploads are untrusted: the real type is detected
 * from the file content (never the client's name or MIME type), only PNG,
 * JPEG and WebP are accepted, and every image is decoded and re-encoded to
 * WebP. Re-encoding drops metadata such as camera GPS/EXIF and anything
 * appended to the file.
 */
final class ImageStore
{
    public const PUBLIC_PREFIX = '/uploads/';
    public const MAX_BYTES = 5 * 1024 * 1024;
    private const MAX_SIDE = 8000;
    private const MAX_PIXELS = 30_000_000;
    private const OUTPUT_SIDE = 800;
    private const FILE_PATTERN = '/^[a-f0-9]{32}\.webp$/';

    public function __construct(private readonly string $uploadDir)
    {
    }

    /**
     * @throws \InvalidArgumentException with a user-facing message
     */
    public function store(string $path): string
    {
        $size = @filesize($path);
        if (false === $size || 0 === $size) {
            throw new \InvalidArgumentException('The upload is empty.');
        }
        if ($size > self::MAX_BYTES) {
            throw new \InvalidArgumentException('The image is larger than 5 MB.');
        }

        $info = @getimagesize($path);
        if (false === $info) {
            throw new \InvalidArgumentException('The file is not a PNG, JPEG or WebP image.');
        }
        [$width, $height, $type] = $info;
        if (!\in_array($type, [\IMAGETYPE_PNG, \IMAGETYPE_JPEG, \IMAGETYPE_WEBP], true)) {
            throw new \InvalidArgumentException('Only PNG, JPEG and WebP images are accepted.');
        }
        if ($width < 1 || $height < 1 || $width > self::MAX_SIDE || $height > self::MAX_SIDE || $width * $height > self::MAX_PIXELS) {
            throw new \InvalidArgumentException('The image dimensions are too large.');
        }

        $source = match ($type) {
            \IMAGETYPE_PNG => @imagecreatefrompng($path),
            \IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            \IMAGETYPE_WEBP => @imagecreatefromwebp($path),
        };
        if (false === $source) {
            throw new \InvalidArgumentException('The image could not be decoded.');
        }

        $scale = min(1, self::OUTPUT_SIDE / max($width, $height));
        $targetW = max(1, (int) round($width * $scale));
        $targetH = max(1, (int) round($height * $scale));
        $target = imagecreatetruecolor($targetW, $targetH);
        imagealphablending($target, false);
        imagesavealpha($target, true);
        imagefill($target, 0, 0, imagecolorallocatealpha($target, 0, 0, 0, 127));
        imagecopyresampled($target, $source, 0, 0, 0, 0, $targetW, $targetH, $width, $height);

        $this->ensureDir();
        $name = bin2hex(random_bytes(16)).'.webp';
        $tmp = $this->uploadDir.'/.'.$name.'.tmp';
        if (!imagewebp($target, $tmp, 82)) {
            @unlink($tmp);
            throw new \RuntimeException('Could not write the image.');
        }
        chmod($tmp, 0644);
        rename($tmp, $this->uploadDir.'/'.$name);

        return $name;
    }

    public function delete(?string $file): void
    {
        if (null !== $file && preg_match(self::FILE_PATTERN, $file)) {
            @unlink($this->uploadDir.'/'.$file);
        }
    }

    private function ensureDir(): void
    {
        if (!is_dir($this->uploadDir) && !mkdir($this->uploadDir, 0755, true) && !is_dir($this->uploadDir)) {
            throw new \RuntimeException('Cannot create upload directory.');
        }
    }
}
