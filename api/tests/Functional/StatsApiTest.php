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

        $expected = ['new_devices' => 1, 'active_devices' => 2, 'answers' => 4, 'correct' => 1, 'hinted' => 1, 'wrong' => 1, 'skipped' => 1, 'rounds' => 1];
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
        self::assertSame([['day' => gmdate('Y-m-d'), 'new_devices' => 0, 'active_devices' => 0, 'answers' => 50, 'correct' => 50, 'hinted' => 0, 'wrong' => 0, 'skipped' => 0, 'rounds' => 0]], $rows);
        self::assertSame(['day', ...UsageStats::COUNTERS], array_column($pdo->query('PRAGMA table_info(usage_daily)')->fetchAll(), 'name'), 'The table has no room for identifiers.');
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
