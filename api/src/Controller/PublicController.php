<?php

declare(strict_types=1);

namespace App\Controller;

use App\Content\SetRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Learner-facing endpoints. They accept no input, set no cookies and start
 * no session: learners download published content and nothing flows back.
 */
final class PublicController
{
    #[Route('/api/health', methods: ['GET'])]
    public function health(): JsonResponse
    {
        return new JsonResponse(['status' => 'ok']);
    }

    #[Route('/api/public/content', methods: ['GET'])]
    public function content(Request $request, SetRepository $sets): Response
    {
        $response = new JsonResponse(['schemaVersion' => 1, 'sets' => $sets->publishedContent()]);
        $response->setEncodingOptions(JsonResponse::DEFAULT_ENCODING_OPTIONS | \JSON_UNESCAPED_UNICODE);
        $response->setEtag(hash('xxh128', (string) $response->getContent()));
        $response->headers->set('Cache-Control', 'no-cache, public');
        $response->isNotModified($request);

        return $response;
    }
}
