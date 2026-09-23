<?php

declare(strict_types=1);

namespace App\Controller;

use App\Content\ImageStore;
use App\Content\ImportValidator;
use App\Content\LineParser;
use App\Content\SetRepository;
use App\Content\TextNormalizer;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Homework management. Authentication and CSRF are enforced for every
 * /api/admin route by AdminGuardSubscriber before these actions run.
 */
#[Route('/api/admin', requirements: ['id' => '[a-z0-9_-]{1,40}', 'entryId' => '[a-z0-9_-]{1,40}'])]
final class AdminSetController
{
    use JsonBody;

    public function __construct(
        private readonly SetRepository $sets,
        private readonly ImportValidator $validator,
        private readonly ImageStore $images,
    ) {
    }

    #[Route('/import/validate', methods: ['POST'])]
    public function validateImport(Request $request, LineParser $lineParser): JsonResponse
    {
        $body = $this->jsonBody($request);
        $text = $body['text'] ?? null;
        if (!\is_string($text) || '' === trim($text)) {
            return new JsonResponse(['error' => 'Paste or upload some content first.'], 400);
        }

        $parseErrors = [];
        if ('lines' === ($body['format'] ?? 'json')) {
            ['document' => $document, 'errors' => $parseErrors] = $lineParser->parse($text);
        } else {
            $text = preg_replace('/^\x{FEFF}/u', '', $text) ?? $text;
            try {
                $document = json_decode($text, true, 64, \JSON_THROW_ON_ERROR);
            } catch (\JsonException $e) {
                return new JsonResponse(['valid' => false, 'draft' => null, 'errors' => [
                    ['path' => '', 'entry' => null, 'message' => 'Not valid JSON: '.$e->getMessage()],
                ], 'warnings' => []]);
            }
        }

        $result = $this->validator->validate($document);
        $data = $result->toArray();
        $data['errors'] = [...$parseErrors, ...$data['errors']];
        $data['valid'] = [] === $data['errors'];
        if (null !== $result->draft) {
            $data['warnings'] = [...$data['warnings'], ...$this->crossSetWarnings($result->draft)];
        }

        return new JsonResponse($data);
    }

    #[Route('/sets', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return new JsonResponse(['sets' => $this->sets->listSummaries()]);
    }

    #[Route('/sets/{id}', methods: ['GET'])]
    public function show(string $id): JsonResponse
    {
        $set = $this->findOr404($id);

        return new JsonResponse(['set' => $set, 'publishBlockers' => SetRepository::publishBlockers($set)]);
    }

    #[Route('/sets', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $result = $this->validator->validate($this->jsonBody($request), requireSchemaVersion: false);
        if (!$result->isValid()) {
            return new JsonResponse($result->toArray(), 422);
        }
        $id = $this->sets->create($result->draft);

        return new JsonResponse(['set' => $this->sets->find($id), 'warnings' => $result->warnings], 201);
    }

    #[Route('/sets/{id}', methods: ['PUT'])]
    public function update(string $id, Request $request): JsonResponse
    {
        $current = $this->findOr404($id);
        $result = $this->validator->validate($this->jsonBody($request), requireSchemaVersion: false);
        if (!$result->isValid()) {
            return new JsonResponse($result->toArray(), 422);
        }
        if ('published' === $current['status']) {
            $blockers = SetRepository::publishBlockers($result->draft);
            if ([] !== $blockers) {
                return new JsonResponse(['valid' => false, 'errors' => array_map(
                    static fn (string $m): array => ['path' => '', 'entry' => null, 'message' => $m.' (the set is published — unpublish it first)'],
                    $blockers,
                ), 'warnings' => []], 422);
            }
        }
        foreach ($this->sets->update($id, $result->draft) as $orphan) {
            $this->images->delete($orphan);
        }

        return new JsonResponse(['set' => $this->sets->find($id), 'warnings' => $result->warnings]);
    }

    #[Route('/sets/{id}', methods: ['DELETE'])]
    public function delete(string $id): JsonResponse
    {
        $this->findOr404($id);
        foreach ($this->sets->delete($id) as $file) {
            $this->images->delete($file);
        }

        return new JsonResponse(['deleted' => $id]);
    }

    #[Route('/sets/{id}/publish', methods: ['POST'])]
    public function publish(string $id): JsonResponse
    {
        $set = $this->findOr404($id);
        $blockers = SetRepository::publishBlockers($set);
        if ([] !== $blockers) {
            return new JsonResponse(['error' => implode(' ', $blockers), 'publishBlockers' => $blockers], 409);
        }
        $this->sets->setStatus($id, 'published');

        return new JsonResponse(['set' => $this->sets->find($id)]);
    }

    #[Route('/sets/{id}/unpublish', methods: ['POST'])]
    public function unpublish(string $id): JsonResponse
    {
        $this->findOr404($id);
        $this->sets->setStatus($id, 'draft');

        return new JsonResponse(['set' => $this->sets->find($id)]);
    }

    #[Route('/sets/{id}/entries/{entryId}/image', methods: ['POST'])]
    public function uploadImage(string $id, string $entryId, Request $request): JsonResponse
    {
        $this->findOr404($id);
        if (!$this->sets->entryExists($id, $entryId)) {
            throw new NotFoundHttpException('Entry not found. Save the set before adding images.');
        }
        $file = $request->files->get('image');
        if (!$file instanceof UploadedFile) {
            return new JsonResponse(['error' => 'Choose an image file to upload.'], 400);
        }
        if (!$file->isValid()) {
            return new JsonResponse(['error' => \UPLOAD_ERR_INI_SIZE === $file->getError() || \UPLOAD_ERR_FORM_SIZE === $file->getError()
                ? 'The image is larger than 5 MB.'
                : 'The upload failed.'], 400);
        }
        try {
            $name = $this->images->store($file->getPathname());
        } catch (\InvalidArgumentException $e) {
            return new JsonResponse(['error' => $e->getMessage()], 422);
        }
        $this->images->delete($this->sets->setEntryImage($id, $entryId, $name));

        return new JsonResponse(['image' => ImageStore::PUBLIC_PREFIX.$name]);
    }

    #[Route('/sets/{id}/entries/{entryId}/image', methods: ['DELETE'])]
    public function deleteImage(string $id, string $entryId): JsonResponse
    {
        $this->findOr404($id);
        if (!$this->sets->entryExists($id, $entryId)) {
            throw new NotFoundHttpException('Entry not found.');
        }
        $this->images->delete($this->sets->setEntryImage($id, $entryId, null));

        return new JsonResponse(['image' => null]);
    }

    /** @return array<string, mixed> */
    private function findOr404(string $id): array
    {
        return $this->sets->find($id) ?? throw new NotFoundHttpException('Homework set not found.');
    }

    /**
     * @param array<string, mixed> $draft
     *
     * @return list<array{path: string, entry: ?int, message: string}>
     */
    private function crossSetWarnings(array $draft): array
    {
        $warnings = [];
        $title = TextNormalizer::matchKey((string) $draft['title']);
        foreach ($this->sets->listSummaries() as $existing) {
            if ('' !== $title && TextNormalizer::matchKey($existing['title']) === $title) {
                $warnings[] = ['path' => 'title', 'entry' => null, 'message' => \sprintf('A set titled “%s” already exists (%s). Importing creates a separate set.', $existing['title'], $existing['status'])];
            }
            if (null !== $draft['weekStart'] && $existing['weekStart'] === $draft['weekStart']) {
                $warnings[] = ['path' => 'weekStart', 'entry' => null, 'message' => \sprintf('“%s” already uses the week %s.', $existing['title'], $existing['weekStart'])];
            }
        }

        return $warnings;
    }
}
