<?php

declare(strict_types=1);

namespace App\Controller;

use App\Content\AudioStore;
use App\Content\SetRepository;
use App\Content\SpeechQueue;
use App\Content\StoryRepository;
use App\Content\StoryValidator;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Listening stories. Authentication and CSRF are enforced for every
 * /api/admin route by AdminGuardSubscriber before these actions run.
 */
#[Route('/api/admin', requirements: ['id' => '[a-z0-9_-]{1,40}'])]
final class AdminStoryController
{
    use JsonBody;

    public function __construct(
        private readonly StoryRepository $stories,
        private readonly StoryValidator $validator,
        private readonly SetRepository $sets,
        private readonly AudioStore $audio,
        private readonly SpeechQueue $speech,
    ) {
    }

    #[Route('/stories', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return new JsonResponse(['stories' => array_map($this->withStatus(...), $this->stories->all())]);
    }

    #[Route('/stories/{id}', methods: ['GET'])]
    public function show(string $id): JsonResponse
    {
        return new JsonResponse(['story' => $this->withStatus($this->findOr404($id))]);
    }

    #[Route('/stories/validate', methods: ['POST'], priority: 1)]
    public function validateImport(Request $request): JsonResponse
    {
        $text = $this->jsonBody($request)['text'] ?? null;
        if (!\is_string($text) || '' === trim($text)) {
            return new JsonResponse(['error' => 'Paste or upload a story first.'], 400);
        }
        try {
            $document = json_decode((string) preg_replace('/^\x{FEFF}/u', '', $text), true, 64, \JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            return new JsonResponse(['valid' => false, 'draft' => null, 'errors' => [['path' => '', 'entry' => null, 'message' => 'Not valid JSON: '.$e->getMessage()]], 'warnings' => []]);
        }
        $result = $this->validator->validate($document);
        $data = $result->toArray();
        if (null !== $result->draft) {
            $data['warnings'] = [...$data['warnings'], ...$this->linkWarnings($result->draft)];
        }

        return new JsonResponse($data);
    }

    #[Route('/stories', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $result = $this->validator->validate($this->jsonBody($request), requireSchemaVersion: false);
        if (!$result->isValid()) {
            return new JsonResponse($result->toArray(), 422);
        }
        $id = $this->stories->create($result->draft);
        $this->speech->refresh();

        return new JsonResponse(['story' => $this->withStatus($this->findOr404($id)), 'warnings' => [...$result->warnings, ...$this->linkWarnings($result->draft)]], 201);
    }

    #[Route('/stories/{id}', methods: ['PUT'])]
    public function update(string $id, Request $request): JsonResponse
    {
        $current = $this->findOr404($id);
        $result = $this->validator->validate($this->jsonBody($request), requireSchemaVersion: false);
        if (!$result->isValid()) {
            return new JsonResponse($result->toArray(), 422);
        }
        $this->stories->update($id, $result->draft);
        $this->speech->refresh();
        $story = $this->findOr404($id);
        if ('published' === $current['status'] && [] !== $this->check($story)['blockers']) {
            // An edit that invalidates the story (new text without audio yet,
            // a review flag) takes it offline instead of serving it broken.
            $this->stories->setStatus($id, 'draft');
            $story = $this->findOr404($id);
        }

        return new JsonResponse(['story' => $this->withStatus($story), 'warnings' => [...$result->warnings, ...$this->linkWarnings($result->draft)]]);
    }

    #[Route('/stories/{id}', methods: ['DELETE'])]
    public function delete(string $id): JsonResponse
    {
        $this->findOr404($id);
        $this->stories->delete($id);
        $this->speech->refresh();

        return new JsonResponse(['deleted' => $id]);
    }

    #[Route('/stories/{id}/publish', methods: ['POST'])]
    public function publish(string $id): JsonResponse
    {
        $story = $this->findOr404($id);
        $blockers = $this->check($story)['blockers'];
        if ([] !== $blockers) {
            return new JsonResponse(['error' => implode(' ', $blockers), 'publishBlockers' => $blockers], 409);
        }
        $this->stories->setStatus($id, 'published');

        return new JsonResponse(['story' => $this->withStatus($this->findOr404($id))]);
    }

    #[Route('/stories/{id}/unpublish', methods: ['POST'])]
    public function unpublish(string $id): JsonResponse
    {
        $this->findOr404($id);
        $this->stories->setStatus($id, 'draft');

        return new JsonResponse(['story' => $this->withStatus($this->findOr404($id))]);
    }

    /** @return array{blockers: list<string>, warnings: list<string>} */
    private function check(array $story): array
    {
        return StoryValidator::publishCheck($story, $this->audio->durationMs($story['transcript']), $this->audio->failure($story['transcript']), $this->sets->entryKeys());
    }

    /**
     * @param array<string, mixed> $story
     *
     * @return array<string, mixed>
     */
    private function withStatus(array $story): array
    {
        $check = $this->check($story);
        $durationMs = $this->audio->durationMs($story['transcript']);
        $failure = $this->audio->failure($story['transcript']);

        return $story + [
            'audio' => [
                'state' => null !== $durationMs ? 'ready' : (null !== $failure ? 'failed' : 'pending'),
                'url' => $this->audio->url($story['transcript']),
                'durationMs' => $durationMs,
                'failure' => $failure,
            ],
            'publishBlockers' => $check['blockers'],
            'publishWarnings' => $check['warnings'],
        ];
    }

    /**
     * Linked words the catalogue does not have yet: fine to use sparingly,
     * but the admin should know they are new for learners.
     *
     * @param array<string, mixed> $draft
     *
     * @return list<array{path: string, entry: null, message: string}>
     */
    private function linkWarnings(array $draft): array
    {
        $known = [];
        foreach ($this->sets->speechTexts() as $text) {
            $known[mb_strtolower($text)] = true;
        }
        $warnings = [];
        foreach ($draft['links']['words'] as $word) {
            if (!isset($known[mb_strtolower($word)])) {
                $warnings[] = ['path' => 'links.words', 'entry' => null, 'message' => \sprintf('“%s” is not in the catalogue yet; learners may not know it.', $word)];
            }
        }
        $sets = $this->sets->ids();
        foreach ($draft['links']['sets'] as $set) {
            if (!\in_array($set, $sets, true)) {
                $warnings[] = ['path' => 'links.sets', 'entry' => null, 'message' => \sprintf('Linked set %s does not exist.', $set)];
            }
        }

        return $warnings;
    }

    /** @return array<string, mixed> */
    private function findOr404(string $id): array
    {
        return $this->stories->find($id) ?? throw new NotFoundHttpException('Story not found.');
    }
}
