<?php

declare(strict_types=1);

namespace App\Controller;

use App\Content\ExamRepository;
use App\Content\SetRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

/** Exams: a selection of sets with an optional date. Guarded like every /api/admin route. */
#[Route('/api/admin', requirements: ['id' => '[a-z0-9_-]{1,40}'])]
final class AdminExamController
{
    use JsonBody;

    public function __construct(private readonly ExamRepository $exams, private readonly SetRepository $sets)
    {
    }

    #[Route('/exams', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return new JsonResponse(['exams' => $this->exams->all()]);
    }

    #[Route('/exams', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        ['draft' => $draft, 'errors' => $errors] = ExamRepository::validate($this->jsonBody($request), $this->sets->ids());
        if (null === $draft) {
            return new JsonResponse(['errors' => $errors], 422);
        }
        $id = $this->exams->create($draft);

        return new JsonResponse(['exam' => $this->exams->find($id)], 201);
    }

    #[Route('/exams/{id}', methods: ['PUT'])]
    public function update(string $id, Request $request): JsonResponse
    {
        $this->findOr404($id);
        ['draft' => $draft, 'errors' => $errors] = ExamRepository::validate($this->jsonBody($request), $this->sets->ids());
        if (null === $draft) {
            return new JsonResponse(['errors' => $errors], 422);
        }
        $this->exams->update($id, $draft);

        return new JsonResponse(['exam' => $this->exams->find($id)]);
    }

    #[Route('/exams/{id}/publish', methods: ['POST'])]
    public function publish(string $id): JsonResponse
    {
        $this->findOr404($id);
        $this->exams->setStatus($id, 'published');

        return new JsonResponse(['exam' => $this->exams->find($id)]);
    }

    #[Route('/exams/{id}/unpublish', methods: ['POST'])]
    public function unpublish(string $id): JsonResponse
    {
        $this->findOr404($id);
        $this->exams->setStatus($id, 'draft');

        return new JsonResponse(['exam' => $this->exams->find($id)]);
    }

    #[Route('/exams/{id}', methods: ['DELETE'])]
    public function delete(string $id): JsonResponse
    {
        $this->findOr404($id);
        $this->exams->delete($id);

        return new JsonResponse(['deleted' => $id]);
    }

    /** @return array<string, mixed> */
    private function findOr404(string $id): array
    {
        return $this->exams->find($id) ?? throw new NotFoundHttpException('Exam not found.');
    }
}
