<?php

declare(strict_types=1);

namespace App\Controller;

use App\Feedback\FeedbackStore;
use App\Feedback\FeedbackThrottle;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The one learner endpoint that accepts input, and only when someone
 * deliberately sends feedback. It stores what was typed, an optional
 * screenshot, the page, browser and IP address (for spotting abuse).
 */
final class FeedbackController
{
    public const MAX_MESSAGE = 5000;
    private const MAX_NAME = 80;

    public function __construct(
        private readonly FeedbackStore $store,
        private readonly FeedbackThrottle $throttle,
        private readonly string $contact,
    ) {
    }

    #[Route('/api/public/feedback', methods: ['POST'])]
    public function submit(Request $request): JsonResponse
    {
        if (!$this->store->hasRoomFor((int) $request->headers->get('Content-Length', '0'))) {
            return new JsonResponse(['error' => 'Feedback is full.', 'code' => 'full', 'contact' => '' !== $this->contact ? $this->contact : null], 507);
        }
        $ip = $request->getClientIp() ?? 'unknown';
        if (!$this->throttle->attempt($ip)) {
            return new JsonResponse(['error' => 'Too many messages. Try again later.', 'code' => 'rate_limited'], 429);
        }

        $message = self::text($request->request->get('message'), self::MAX_MESSAGE, true);
        if (null === $message) {
            return new JsonResponse(['error' => 'Write a message (up to '.self::MAX_MESSAGE.' characters).', 'code' => 'invalid'], 400);
        }

        $file = $request->files->get('screenshot');
        if (null !== $file && (!$file instanceof UploadedFile || !$file->isValid())) {
            return new JsonResponse(['error' => 'The screenshot upload failed.', 'code' => 'bad_image'], 400);
        }

        try {
            $id = $this->store->add([
                'name' => self::text($request->request->get('name'), self::MAX_NAME),
                'message' => $message,
                'page' => self::text($request->request->get('page'), 200),
                'viewport' => self::text($request->request->get('viewport'), 20),
                'userAgent' => self::text($request->headers->get('User-Agent'), 400),
                'ip' => $ip,
            ], $file?->getPathname());
        } catch (\InvalidArgumentException $e) {
            return new JsonResponse(['error' => $e->getMessage(), 'code' => 'bad_image'], 400);
        }

        return new JsonResponse(['id' => $id], 201);
    }

    /** Trimmed single- or multi-line text without control characters; null if empty or too long. */
    private static function text(mixed $value, int $max, bool $multiline = false): ?string
    {
        if (!\is_string($value) || !mb_check_encoding($value, 'UTF-8')) {
            return null;
        }
        $value = str_replace("\r\n", "\n", $value);
        $value = preg_replace($multiline ? '/[^\P{Cc}\n\t]/u' : '/\p{Cc}/u', '', $value) ?? '';
        $value = trim($value);
        if ('' === $value) {
            return null;
        }

        return mb_strlen($value) <= $max ? $value : ($multiline ? null : mb_substr($value, 0, $max));
    }
}
