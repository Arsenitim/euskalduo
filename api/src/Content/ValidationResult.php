<?php

declare(strict_types=1);

namespace App\Content;

final readonly class ValidationResult
{
    /**
     * @param array<string, mixed>|null                                   $draft
     * @param list<array{path: string, entry: ?int, message: string}> $errors
     * @param list<array{path: string, entry: ?int, message: string}> $warnings
     */
    public function __construct(
        public ?array $draft,
        public array $errors,
        public array $warnings,
    ) {
    }

    public function isValid(): bool
    {
        return [] === $this->errors;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'valid' => $this->isValid(),
            'draft' => $this->draft,
            'errors' => $this->errors,
            'warnings' => $this->warnings,
        ];
    }
}
