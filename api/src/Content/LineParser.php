<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Convenience parser for quick "Basque — Spanish" lines.
 *
 *   sagarra — la manzana
 *   Txapelketa — campeonato; concurso
 *
 * Separator between the term and its meaning: em/en dash, tab, "=" or a
 * hyphen surrounded by spaces (so "Bizkar-zorroa" keeps its hyphen).
 * Alternatives on the right are separated by ";", "," or "/".
 * Lines starting with "#" are ignored. JSON remains the canonical format.
 */
final class LineParser
{
    /**
     * @return array{document: array<string, mixed>, errors: list<array{path: string, entry: ?int, message: string}>}
     */
    public function parse(string $text, string $title = ''): array
    {
        $entries = [];
        $errors = [];
        foreach (preg_split('/\R/u', $text) ?: [] as $lineNo => $line) {
            $line = trim($line);
            if ('' === $line || str_starts_with($line, '#')) {
                continue;
            }
            $parts = preg_split('/\s*[—–]\s*|\t+|\s+-\s+|\s*=\s*/u', $line, 2);
            if (!\is_array($parts) || 2 !== \count($parts) || '' === trim($parts[0]) || '' === trim($parts[1])) {
                $errors[] = [
                    'path' => 'line '.($lineNo + 1),
                    'entry' => null,
                    'message' => \sprintf('Line %d is not in the form “Basque — Spanish”: %s', $lineNo + 1, mb_substr($line, 0, 80)),
                ];
                continue;
            }
            $alternatives = array_values(array_filter(
                array_map('trim', preg_split('/[;,\/]/u', $parts[1]) ?: []),
                static fn (string $s): bool => '' !== $s,
            ));
            $entries[] = ['basque' => trim($parts[0]), 'translations' => ['es' => $alternatives]];
        }

        return [
            'document' => [
                'schemaVersion' => ImportValidator::SCHEMA_VERSION,
                'title' => $title,
                'weekStart' => null,
                'entries' => $entries,
            ],
            'errors' => $errors,
        ];
    }
}
