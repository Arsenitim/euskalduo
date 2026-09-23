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
}
