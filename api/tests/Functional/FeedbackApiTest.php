<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Feedback\FeedbackStore;
use App\Feedback\FeedbackThrottle;
use App\Tests\TempDirs;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class FeedbackApiTest extends WebTestCase
{
    use TempDirs;

    private KernelBrowser $client;
    private string $data;

    protected function setUp(): void
    {
        $this->data = $this->tempDir();
        $this->boot(['FEEDBACK_MAX_MB' => '1', 'FEEDBACK_CONTACT' => 'Arsenii']);
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        $this->removeTempDirs();
    }

    public function testStoresMessageWithScreenshotIpAndBrowser(): void
    {
        $png = tempnam(sys_get_temp_dir(), 'fb');
        $image = imagecreatetruecolor(2400, 1200);
        imagepng($image, $png);

        $response = $this->send(
            ['name' => ' Ane ', 'message' => "La palabra «igandea» sale mal.\r\nGracias\x07", 'page' => '#/practicar', 'viewport' => '820x1180'],
            new UploadedFile($png, 'shot.png', 'image/png', null, true),
        );

        self::assertResponseStatusCodeSame(201);
        $id = $response['id'];
        self::assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $id);
        $record = json_decode((string) file_get_contents($this->data."/feedback/$id.json"), true);
        self::assertSame('Ane', $record['name']);
        self::assertSame("La palabra «igandea» sale mal.\nGracias", $record['message']);
        self::assertSame('10.1.2.3', $record['ip']);
        self::assertSame('TestBrowser/1.0', $record['userAgent']);
        self::assertSame('#/practicar', $record['page']);
        self::assertSame("$id.webp", $record['screenshot']);
        self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $record['receivedAt']);
        $info = getimagesize($this->data."/feedback/$id.webp");
        self::assertSame([\IMAGETYPE_WEBP, FeedbackStore::SCREENSHOT_SIDE], [$info[2], $info[0]]);
    }

    public function testRequiresAMessage(): void
    {
        $response = $this->send(['name' => 'Ane', 'message' => "  \n "]);

        self::assertResponseStatusCodeSame(400);
        self::assertSame('invalid', $response['code']);
        self::assertSame([], glob($this->data.'/feedback/*') ?: []);
    }

    public function testRejectsANonImageScreenshot(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'fb');
        file_put_contents($path, '<svg xmlns="http://www.w3.org/2000/svg"/>');

        $response = $this->send(['message' => 'hola'], new UploadedFile($path, 'x.png', 'image/png', null, true));

        self::assertResponseStatusCodeSame(400);
        self::assertSame('bad_image', $response['code']);
        self::assertSame([], glob($this->data.'/feedback/*.json') ?: []);
    }

    public function testRateLimitsPerIp(): void
    {
        for ($i = 0; $i < FeedbackThrottle::MAX_PER_WINDOW; ++$i) {
            $this->send(['message' => "msg $i"]);
            self::assertResponseStatusCodeSame(201);
        }
        self::assertSame('rate_limited', $this->send(['message' => 'one more'])['code']);
        self::assertResponseStatusCodeSame(429);

        $this->send(['message' => 'another sender'], null, '10.9.9.9');
        self::assertResponseStatusCodeSame(201);
    }

    public function testRefusesOnceTheSizeCapIsReachedAndNamesTheContact(): void
    {
        mkdir($this->data.'/feedback');
        file_put_contents($this->data.'/feedback/filler.json', str_repeat('x', 1024 * 1024 - 10));

        $response = $this->send(['message' => 'does not fit']);

        self::assertResponseStatusCodeSame(507);
        self::assertSame(['full', 'Arsenii'], [$response['code'], $response['contact']]);
    }

    public function testPurgeThroughDeletesOnlyOlderEntries(): void
    {
        $store = new FeedbackStore($this->data, 1);
        $fields = ['name' => null, 'message' => 'x', 'page' => null, 'viewport' => null, 'userAgent' => null, 'ip' => null];
        $first = $store->add($fields, null, 1_000);
        $second = $store->add($fields, null, 2_000);
        $third = $store->add($fields, null, 3_000);

        self::assertSame([$first, $second, $third], $store->ids());
        self::assertSame(2, $store->purgeThrough($second));
        self::assertSame([$third], $store->ids());
    }

    /** @param array<string, string> $env */
    private function boot(array $env): void
    {
        foreach (['DATA_DIR' => $this->data, 'UPLOAD_DIR' => $this->tempDir()] + $env as $k => $v) {
            $_SERVER[$k] = $_ENV[$k] = $v;
        }
        $this->client = static::createClient();
    }

    /**
     * @param array<string, string> $fields
     *
     * @return array<string, mixed>
     */
    private function send(array $fields, ?UploadedFile $file = null, string $ip = '10.1.2.3'): array
    {
        $this->client->request('POST', '/api/public/feedback', $fields, null !== $file ? ['screenshot' => $file] : [], [
            'REMOTE_ADDR' => $ip,
            'HTTP_USER_AGENT' => 'TestBrowser/1.0',
            'CONTENT_LENGTH' => '1000',
        ]);

        return json_decode((string) $this->client->getResponse()->getContent(), true);
    }
}
