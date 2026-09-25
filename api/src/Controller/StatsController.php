<?php

declare(strict_types=1);

namespace App\Controller;

use App\Stats\UsageStats;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class StatsController
{
    use JsonBody;

    /** Upper bound per counter and request; a browser sends one answer at a time. */
    private const MAX_PER_REQUEST = 50;
    private const ANSWER_RESULTS = ['correct', 'hinted', 'wrong', 'skipped'];

    public function __construct(private readonly UsageStats $stats)
    {
    }

    /**
     * Anonymous counters from the learner app, sent only while practising:
     * {"newDevice": bool, "activeToday": bool, "answers": {"correct": n, …}, "rounds": n}.
     * Nothing identifying is accepted or stored. A JSON body is required, so
     * other sites cannot post here from a plain HTML form.
     */
    #[Route('/api/public/stats', methods: ['POST'])]
    public function record(Request $request): Response
    {
        $body = $this->jsonBody($request);
        $answers = \is_array($body['answers'] ?? null) ? $body['answers'] : [];
        $deltas = [
            'new_devices' => true === ($body['newDevice'] ?? null) ? 1 : 0,
            'active_devices' => true === ($body['activeToday'] ?? null) ? 1 : 0,
            'rounds' => self::count($body['rounds'] ?? 0),
        ];
        foreach (self::ANSWER_RESULTS as $result) {
            $deltas[$result] = self::count($answers[$result] ?? 0);
        }
        $deltas['answers'] = $deltas['correct'] + $deltas['hinted'] + $deltas['wrong'] + $deltas['skipped'];
        $this->stats->add($deltas);

        return new Response(null, 204);
    }

    #[Route('/api/admin/stats', methods: ['GET'])]
    public function report(): JsonResponse
    {
        return new JsonResponse($this->stats->report());
    }

    private static function count(mixed $value): int
    {
        return \is_int($value) ? max(0, min(self::MAX_PER_REQUEST, $value)) : 0;
    }
}
