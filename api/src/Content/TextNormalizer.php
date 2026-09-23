<?php

declare(strict_types=1);

namespace App\Content;

final class TextNormalizer
{
    /**
     * Normalises untrusted text for storage: Unicode NFC (so "á" typed as
     * a + combining accent equals the precomposed letter), trimmed, internal
     * whitespace collapsed. Spelling, case and diacritics are preserved.
     *
     * @throws \InvalidArgumentException for text that is not safe to store
     */
    public static function clean(string $value): string
    {
        if (!mb_check_encoding($value, 'UTF-8')) {
            throw new \InvalidArgumentException('Text is not valid UTF-8.');
        }
        $value = \Normalizer::normalize($value, \Normalizer::FORM_C);
        if (false === $value) {
            throw new \InvalidArgumentException('Text could not be normalised.');
        }
        $value = trim((string) preg_replace('/[\s\x{00A0}\x{2000}-\x{200B}\x{202F}\x{3000}]+/u', ' ', $value));
        // Control characters (other than whitespace handled above) and bidi overrides.
        if (preg_match('/[\p{Cc}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', $value)) {
            throw new \InvalidArgumentException('Text contains control characters.');
        }
        // Content is always rendered as plain text, but angle brackets never
        // belong in vocabulary and usually indicate pasted markup.
        if (preg_match('/[<>]/', $value)) {
            throw new \InvalidArgumentException('Text must not contain < or >.');
        }

        return $value;
    }

    /**
     * Key used to detect duplicates: case-, accent- and whitespace-insensitive.
     */
    public static function matchKey(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $decomposed = \Normalizer::normalize($value, \Normalizer::FORM_D) ?: $value;

        return (string) preg_replace(['/\p{Mn}+/u', '/\s+/u'], ['', ' '], $decomposed);
    }
}
