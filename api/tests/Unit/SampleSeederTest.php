<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Content\Database;
use App\Content\ImportValidator;
use App\Content\SampleSeeder;
use App\Content\SetRepository;
use App\Tests\TempDirs;
use PHPUnit\Framework\TestCase;

final class SampleSeederTest extends TestCase
{
    use TempDirs;

    protected function tearDown(): void
    {
        $this->removeTempDirs();
    }

    public function testSamplesAreSeededOnlyOnceAndNeverRecreated(): void
    {
        $db = new Database($this->tempDir());
        $sets = new SetRepository($db);
        $seeder = new SampleSeeder($db, $sets, new ImportValidator());
        $sampleDir = \dirname(self::samplePath('hiztegia-1-gaia.json'));

        $titles = $seeder->seedOnce($sampleDir, new \DateTimeImmutable('2026-09-24'));
        self::assertSame(['HIZTEGIA (1.Gaia)', 'HILABETEAK ETA ASTEGUNAK'], $titles);
        $published = $sets->publishedContent();
        self::assertSame(['2026-09-21', '2026-09-14'], array_column($published, 'weekStart'));
        self::assertTrue($published[0]['sample']);

        foreach ($sets->listSummaries() as $summary) {
            $sets->delete($summary['id']);
        }
        self::assertSame([], $seeder->seedOnce($sampleDir));
        self::assertSame([], $sets->listSummaries(), 'Deleted samples must not come back on the next start.');
    }

    public function testCategoriesAreSeededOnceAlsoIntoExistingDatabases(): void
    {
        $db = new Database($this->tempDir());
        $sets = new SetRepository($db);
        $seeder = new SampleSeeder($db, $sets, new ImportValidator());
        $sampleDir = \dirname(self::samplePath('hiztegia-1-gaia.json'));
        $seeder->seedOnce($sampleDir, new \DateTimeImmutable('2026-09-24'));

        self::assertSame(['ASTEGUNAK', 'HILABETEAK'], $seeder->seedTopicsOnce($sampleDir.'/topics'));
        $published = $sets->publishedContent();
        self::assertSame(['week', 'week', 'topic', 'topic'], array_column($published, 'kind'), 'Weeks first, then categories.');
        self::assertSame([null, null], array_column(\array_slice($published, 2), 'weekStart'));
        self::assertFalse($published[2]['sample']);
        self::assertSame(['astelehena', 'asteartea'], \array_slice(array_column($published[2]['entries'], 'id'), 0, 2));

        self::assertSame([], $seeder->seedTopicsOnce($sampleDir.'/topics'));
        self::assertCount(4, $sets->listSummaries());
    }

    public function testExistingDatabaseGainsTheKindColumn(): void
    {
        $dir = $this->tempDir();
        $pdo = new \PDO('sqlite:'.$dir.'/euskalduo.sqlite');
        $pdo->exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        $pdo->exec("INSERT INTO meta VALUES ('schema_version', '2')");
        $pdo->exec("CREATE TABLE homework_sets (id TEXT PRIMARY KEY, title TEXT NOT NULL, week_start TEXT, description TEXT, groups_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL, is_sample INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT)");
        $pdo->exec("INSERT INTO homework_sets (id, title, week_start, status, created_at, updated_at) VALUES ('sold', 'Old week', '2026-09-14', 'published', 'x', 'x')");
        unset($pdo);

        $db = new Database($dir);
        self::assertSame('week', (new SetRepository($db))->find('sold')['kind']);
        self::assertSame('3', $db->getMeta('schema_version'));
    }
}
