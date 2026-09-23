<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

trait JsonBody
{
    /** @return array<string, mixed> */
    private function jsonBody(Request $request): array
    {
        if ('json' !== $request->getContentTypeFormat()) {
            throw new BadRequestHttpException('Expected a JSON request body.');
        }
        try {
            $data = json_decode($request->getContent(), true, 64, \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new BadRequestHttpException('The request body is not valid JSON.');
        }
        if (!\is_array($data) || array_is_list($data)) {
            throw new BadRequestHttpException('Expected a JSON object.');
        }

        return $data;
    }
}
