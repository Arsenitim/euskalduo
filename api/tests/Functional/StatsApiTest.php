<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Content\Database;
use App\Stats\UsageStats;
use App\Tests\TempDirs;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StatsApiTest extends WebTestCase
{
    use TempDirs;

    private const PASSWORD = 'correct horse battery';

    private KernelBrowser $client;
    private string $data;

    protected function setUp(): void
    {
        $this->data = $this->tempDir();
        foreach (['DATA_DIR' => $this->data, 'UPLOAD_DIR' => $this->tempDir(), 'ADMIN_USERNAME' => 'admin', 'ADMIN_PASSWORD' => self::PASSWORD] as $k => $v) {
            $_SERVER[$k] = $_ENV[$k] = $v;
        }
        $this->client = static::createClient();
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        $this->removeTempDirs();
    }

    public function testCountsDevicesAnswersAndRoundsForTheAdmin(): void
    {
        $this->post(['newDevice' => true, 'activeToday' => true, 'answers' => ['correct' => 1]]);
        self::assertResponseStatusCodeSame(204);
        $this->post(['answers' => ['hinted' => 1]]);
        $this->post(['answers' => ['skipped' => 1]]);
        $this->post(['activeToday' => true, 'answers' => ['wrong' => 1], 'rounds' => 1]);

        $this->login();
        $this->client->request('GET', '/api/admin/stats');
        self::assertResponseIsSuccessful();
        $report = json_decode((string) $this->client->getResponse()->getContent(), true);

        $expected = ['new_devices' => 1, 'active_devices' => 2, 'answers' => 4, 'correct' => 1, 'hinted' => 1, 'wrong' => 1, 'skipped' => 1, 'rounds' => 1, 'weekly_devices' => 0];
        self::assertSame($expected, $report['totals']);
        self::assertCount(30, $report['days']);
        self::assertSame(['day' => gmdate('Y-m-d')] + $expected, $report['days'][0]);
        self::assertSame(0, $report['days'][1]['answers'], 'Days without activity are listed as zeros.');
    }

    public function testStoresOnlyCappedCountersAndNothingIdentifying(): void
    {
        $this->post(['answers' => ['correct' => 1_000_000, 'wrong' => -5, 'hinted' => '3'], 'rounds' => 2.5, 'newDevice' => 'yes', 'name' => 'Ane', 'deviceId' => 'abc']);
        self::assertResponseStatusCodeSame(204);

        $pdo = (new Database($this->data))->pdo();
        $rows = $pdo->query('SELECT * FROM usage_daily')->fetchAll();
        self::assertSame([['day' => gmdate('Y-m-d'), 'new_devices' => 0, 'active_devices' => 0, 'answers' => 500, 'correct' => 500, 'hinted' => 0, 'wrong' => 0, 'skipped' => 0, 'rounds' => 0, 'weekly_devices' => 0]], $rows);
        self::assertSame(['day', ...UsageStats::COUNTERS], array_column($pdo->query('PRAGMA table_info(usage_daily)')->fetchAll(), 'name'), 'The table has no room for identifiers.');
        self::assertSame(['day', 'dimension', 'key', ...UsageStats::BREAKDOWN_COUNTERS], array_column($pdo->query('PRAGMA table_info(usage_breakdown)')->fetchAll(), 'name'));
    }

    public function testCountsWeeklyDevicesAndBreaksCountersDownByKnownLabelsOnly(): void
    {
        [$setId, $title] = $this->publishedSet();
        $part = static fn (string $dimension, string $key, array $answers, int $rounds = 0): array => ['dimension' => $dimension, 'key' => $key, 'answers' => $answers, 'rounds' => $rounds];
        $this->post([
            'activeToday' => true,
            'activeWeek' => true,
            'answers' => ['correct' => 2, 'wrong' => 1],
            'rounds' => 1,
            'breakdown' => [
                $part('set', $setId, ['correct' => 2, 'wrong' => 1], 1),
                $part('exercise', 'spell', ['correct' => 1, 'wrong' => 1]),
                $part('exercise', 'order', ['correct' => 1]),
                $part('mode', 'week', ['correct' => 2, 'wrong' => 1], 1),
                $part('connection', 'offline', ['correct' => 2, 'wrong' => 1], 1),
                $part('display', 'app', ['correct' => 2, 'wrong' => 1], 1),
                // Ignored: unknown sets, labels and dimensions, free text, bad shapes.
                $part('set', 'no-such-set', ['correct' => 5]),
                $part('exercise', 'Ane Etxeberria', ['correct' => 5]),
                $part('name', 'Ane', ['correct' => 5]),
                ['dimension' => 'mode', 'key' => ['week']],
                'spell',
            ],
        ]);
        self::assertResponseStatusCodeSame(204);
        $this->post(['activeToday' => true, 'answers' => ['skipped' => 1], 'breakdown' => [$part('exercise', 'spell', ['skipped' => 1, 'correct' => 900])]]);

        $this->login();
        $this->client->request('GET', '/api/admin/stats');
        $report = json_decode((string) $this->client->getResponse()->getContent(), true);

        self::assertSame(1, $report['totals']['weekly_devices']);
        self::assertSame(1, $report['weeks'][0]['weekly_devices']);
        self::assertSame(4, $report['weeks'][0]['answers']);
        self::assertCount(8, $report['weeks']);
        $byKey = static fn (string $dimension): array => array_column($report['breakdown'][$dimension], null, 'key');
        self::assertSame(['key' => $setId, 'title' => $title, 'answers' => 3, 'correct' => 2, 'hinted' => 0, 'wrong' => 1, 'skipped' => 0, 'rounds' => 1], $byKey('set')[$setId]);
        self::assertCount(1, $report['breakdown']['set']);
        self::assertSame(['spell', 'order'], array_keys($byKey('exercise')));
        self::assertSame(['answers' => 503, 'correct' => 501, 'wrong' => 1, 'skipped' => 1], array_intersect_key($byKey('exercise')['spell'], array_flip(['answers', 'correct', 'wrong', 'skipped'])));
        self::assertSame(['week'], array_keys($byKey('mode')));
        self::assertSame(1, $byKey('connection')['offline']['rounds']);
        self::assertSame(3, $byKey('display')['app']['answers']);
        self::assertSame(['set', 'story', 'exercise', 'mode', 'connection', 'display'], array_keys($report['breakdown']));
    }

    public function testAcceptsTheNewLessonListeningAndExerciseLabels(): void
    {
        $part = static fn (string $dimension, string $key): array => ['dimension' => $dimension, 'key' => $key, 'answers' => ['correct' => 1], 'rounds' => 0];
        $this->post(['answers' => ['correct' => 1], 'breakdown' => [
            $part('mode', 'lesson'), $part('mode', 'listening'), $part('mode', 'mix'),
            $part('exercise', 'sentence-build'), $part('exercise', 'grammar-choice'), $part('exercise', 'listening'),
            $part('story', 'no-such-story'),
        ]]);
        self::assertResponseStatusCodeSame(204);
        $this->login();
        $this->client->request('GET', '/api/admin/stats');
        $report = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertEqualsCanonicalizing(['lesson', 'listening', 'mix'], array_column($report['breakdown']['mode'], 'key'), 'legacy "mix" from queued counters still counts');
        self::assertEqualsCanonicalizing(['sentence-build', 'grammar-choice', 'listening'], array_column($report['breakdown']['exercise'], 'key'));
        self::assertSame([], $report['breakdown']['story'], 'only ids of existing stories');
    }

    public function testFilesOfflinePracticeUnderItsOwnRecentDay(): void
    {
        $day = static fn (string $modify): string => (new \DateTimeImmutable('today', new \DateTimeZone('UTC')))->modify($modify)->format('Y-m-d');
        $this->post(['day' => $day('-3 days'), 'activeToday' => true, 'answers' => ['correct' => 40, 'wrong' => 2], 'rounds' => 4]);
        self::assertResponseStatusCodeSame(204);
        $this->post(['day' => $day('+1 day'), 'answers' => ['correct' => 1]]);
        // Too old, too far ahead, impossible or malformed: counted today instead.
        foreach ([$day('-31 days'), $day('+2 days'), '2026-02-30', '2026-9-1', 20260901] as $bad) {
            $this->post(['day' => $bad, 'answers' => ['skipped' => 1]]);
            self::assertResponseStatusCodeSame(204);
        }

        $rows = array_column((new Database($this->data))->pdo()->query('SELECT day, answers, correct, skipped, rounds, active_devices FROM usage_daily')->fetchAll(), null, 'day');
        self::assertSame(['day' => $day('-3 days'), 'answers' => 42, 'correct' => 40, 'skipped' => 0, 'rounds' => 4, 'active_devices' => 1], $rows[$day('-3 days')]);
        self::assertSame(1, $rows[$day('+1 day')]['correct']);
        self::assertSame(5, $rows[$day('+0 days')]['skipped']);
        self::assertCount(3, $rows);
    }

    public function testRequiresAJsonBody(): void
    {
        $this->client->request('POST', '/api/public/stats', ['answers' => ['correct' => 1]]);

        self::assertResponseStatusCodeSame(400);
    }

    public function testReportFillsGapsAndKeepsOlderDaysInTotals(): void
    {
        $stats = new UsageStats(new Database($this->data));
        $stats->add(['answers' => 5, 'correct' => 5], '2026-08-01');
        $stats->add(['answers' => 2, 'wrong' => 2], '2026-09-23');

        $report = $stats->report(7, '2026-09-24');

        self::assertSame(7, $report['totals']['answers']);
        self::assertSame(['2026-09-24', '2026-09-23'], [$report['days'][0]['day'], $report['days'][1]['day']]);
        self::assertSame([0, 2], [$report['days'][0]['answers'], $report['days'][1]['answers']]);
        self::assertSame('2026-09-18', $report['days'][6]['day']);
    }

    /** @return array{string, string} id and title of a homework set in the database */
    private function publishedSet(): array
    {
        $now = gmdate('c');
        (new Database($this->data))->pdo()
            ->prepare("INSERT INTO homework_sets (id, title, week_start, status, created_at, updated_at, published_at) VALUES ('week-1', 'HIZTEGIA (1.Gaia)', '2026-09-21', 'published', ?, ?, ?)")
            ->execute([$now, $now, $now]);

        return ['week-1', 'HIZTEGIA (1.Gaia)'];
    }

    /** @param array<string, mixed> $body */
    private function post(array $body): void
    {
        $this->client->request('POST', '/api/public/stats', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode($body, \JSON_THROW_ON_ERROR));
    }

    private function login(): void
    {
        $this->client->request('POST', '/api/admin/login', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode(['username' => 'admin', 'password' => self::PASSWORD]));
        self::assertResponseIsSuccessful();
    }
}
