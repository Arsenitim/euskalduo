<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Always answer /api requests with a small JSON error, never an HTML page
 * or stack trace. Request bodies are never logged.
 */
final class ApiExceptionSubscriber implements EventSubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::EXCEPTION => ['onException', -64]];
    }

    public function onException(ExceptionEvent $event): void
    {
        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api/')) {
            return;
        }
        $e = $event->getThrowable();
        if ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();
            $message = $status < 500 ? $e->getMessage() : 'Server error.';
            if ('' === $message || str_starts_with($message, 'No route found')) {
                $message = 404 === $status ? 'Not found.' : ($status === 405 ? 'Method not allowed.' : 'Request failed.');
            }
            $event->setResponse(new JsonResponse(['error' => $message], $status, $e->getHeaders()));

            return;
        }
        $event->setResponse(new JsonResponse(['error' => 'Server error.'], 500));
    }
}
