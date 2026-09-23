<?php

declare(strict_types=1);

namespace App\Security;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Server-side protection of every /api/admin route:
 *  - a logged-in admin session is required (except for login/session probe);
 *  - state-changing requests must carry the per-session CSRF token header.
 */
final class AdminGuardSubscriber implements EventSubscriberInterface
{
    public const SESSION_USER = 'admin_user';
    public const SESSION_CSRF = 'admin_csrf';
    public const CSRF_HEADER = 'X-CSRF-Token';

    private const PUBLIC_ADMIN_ROUTES = ['/api/admin/login', '/api/admin/session'];

    public static function getSubscribedEvents(): array
    {
        // After the session listener (128), before routing (32): even unknown
        // admin paths answer 401 to anonymous callers.
        return [KernelEvents::REQUEST => ['onRequest', 64]];
    }

    public function onRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        $request = $event->getRequest();
        $path = $request->getPathInfo();
        if (!str_starts_with($path, '/api/admin/') || \in_array($path, self::PUBLIC_ADMIN_ROUTES, true)) {
            return;
        }

        $session = $request->getSession();
        if (!\is_string($session->get(self::SESSION_USER))) {
            $event->setResponse(new JsonResponse(['error' => 'Authentication required.'], 401));

            return;
        }

        if (!$request->isMethodSafe()) {
            $expected = $session->get(self::SESSION_CSRF);
            $given = $request->headers->get(self::CSRF_HEADER, '');
            if (!\is_string($expected) || '' === $given || !hash_equals($expected, $given)) {
                $event->setResponse(new JsonResponse(['error' => 'Missing or invalid CSRF token.'], 403));
            }
        }
    }
}
