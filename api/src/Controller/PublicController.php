<?php

declare(strict_types=1);

namespace App\Controller;

use App\Content\ExamRepository;
use App\Content\SetRepository;
use App\Content\StoryRepository;
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
    public function content(Request $request, SetRepository $sets, StoryRepository $stories, ExamRepository $exams): Response
    {
        $published = $sets->publishedContent();
        $response = new JsonResponse([
            'schemaVersion' => 2,
            'sets' => $published,
            'stories' => $stories->publishedContent(),
            'exams' => $exams->publishedContent(array_column($published, 'id')),
        ]);
        $response->setEncodingOptions(JsonResponse::DEFAULT_ENCODING_OPTIONS | \JSON_UNESCAPED_UNICODE);
        $response->setEtag(hash('xxh128', (string) $response->getContent()));
        $response->headers->set('Cache-Control', 'no-cache, public');
        $response->isNotModified($request);

        return $response;
    }
}
