<?php

declare(strict_types=1);

namespace App\Controller;

use App\Security\AdminCredentials;
use App\Security\AdminGuardSubscriber as Guard;
use App\Security\LoginThrottle;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

final class AdminAuthController
{
    use JsonBody;

    public function __construct(
        private readonly AdminCredentials $credentials,
        private readonly LoginThrottle $throttle,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/api/admin/login', methods: ['POST'])]
    public function login(Request $request): JsonResponse
    {
        // Requiring a JSON body means a cross-site HTML form cannot log in.
        $body = $this->jsonBody($request);
        if ($this->throttle->isLocked()) {
            return new JsonResponse(['error' => 'Too many failed attempts. Try again in a few minutes.'], 429);
        }
        $username = \is_string($body['username'] ?? null) ? $body['username'] : '';
        $password = \is_string($body['password'] ?? null) ? $body['password'] : '';

        if (!$this->credentials->verify($username, $password)) {
            $this->throttle->recordFailure();
            $this->logger->warning('Failed admin login attempt.');

            return new JsonResponse(['error' => 'Wrong username or password.'], 401);
        }

        $this->throttle->reset();
        $session = $request->getSession();
        $session->migrate(true);
        $session->set(Guard::SESSION_USER, $this->credentials->username());
        $session->set(Guard::SESSION_CSRF, bin2hex(random_bytes(32)));
        $this->logger->info('Admin logged in.');

        return $this->sessionState($request);
    }

    #[Route('/api/admin/session', methods: ['GET'])]
    public function session(Request $request): JsonResponse
    {
        return $this->sessionState($request);
    }

    #[Route('/api/admin/logout', methods: ['POST'])]
    public function logout(Request $request): JsonResponse
    {
        $request->getSession()->invalidate();

        return new JsonResponse(['authenticated' => false]);
    }

    private function sessionState(Request $request): JsonResponse
    {
        // Only probe the session if the browser already has a cookie, so a
        // visit to the login page does not create one.
        if (!$request->hasPreviousSession() && !$request->getSession()->isStarted()) {
            return new JsonResponse(['authenticated' => false]);
        }
        $session = $request->getSession();
        $user = $session->get(Guard::SESSION_USER);

        return new JsonResponse(\is_string($user)
            ? ['authenticated' => true, 'username' => $user, 'csrfToken' => $session->get(Guard::SESSION_CSRF)]
            : ['authenticated' => false]);
    }
}
