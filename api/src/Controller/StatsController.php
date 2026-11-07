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

    /**
     * Upper bound per counter and request. Browsers usually send one answer at
     * a time, but after practising offline they send a day's counters at once.
     */
    private const MAX_PER_REQUEST = 500;
    /** Offline practice is filed under its own day if it is at most this old. */
    private const MAX_DAYS_BACK = 30;
    private const ANSWER_RESULTS = ['correct', 'hinted', 'wrong', 'skipped'];

    public function __construct(private readonly UsageStats $stats)
    {
    }

    /**
     * Anonymous counters from the learner app, sent only while practising:
     * {"day": "YYYY-MM-DD", "newDevice": bool, "activeToday": bool, "answers": {"correct": n, …}, "rounds": n}.
     * "day" is optional (the device's date when it practised, e.g. offline);
     * a missing, malformed or out-of-range day counts as today (UTC).
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
        $this->stats->add($deltas, self::day($body['day'] ?? null));

        return new Response(null, 204);
    }

    #[Route('/api/admin/stats', methods: ['GET'])]
    public function report(): JsonResponse
    {
        return new JsonResponse($this->stats->report());
    }

    private static function day(mixed $value): ?string
    {
        if (!\is_string($value) || 1 !== preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }
        $utc = new \DateTimeZone('UTC');
        $day = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, $utc);
        if (false === $day || $day->format('Y-m-d') !== $value) {
            return null;
        }
        $today = new \DateTimeImmutable('today', $utc);
        // The device's date may be a day ahead of UTC (time zones east of UTC).
        if ($day > $today->modify('+1 day') || $day < $today->modify('-'.self::MAX_DAYS_BACK.' days')) {
            return null;
        }

        return $value;
    }

    private static function count(mixed $value): int
    {
        return \is_int($value) ? max(0, min(self::MAX_PER_REQUEST, $value)) : 0;
    }
}
