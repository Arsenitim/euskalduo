<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Security\LoginThrottle;
use App\Tests\TempDirs;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class AdminApiTest extends WebTestCase
{
    use TempDirs;

    private const PASSWORD = 'correct horse battery';

    private KernelBrowser $client;
    private string $uploads;

    protected function setUp(): void
    {
        $data = $this->tempDir();
        $this->uploads = $this->tempDir();
        foreach (['DATA_DIR' => $data, 'UPLOAD_DIR' => $this->uploads, 'ADMIN_USERNAME' => 'admin', 'ADMIN_PASSWORD' => self::PASSWORD] as $k => $v) {
            $_SERVER[$k] = $_ENV[$k] = $v;
        }
        $this->client = static::createClient();
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        $this->removeTempDirs();
    }

    /** @return iterable<string, array{string, string}> */
    public static function protectedRoutes(): iterable
    {
        yield 'list' => ['GET', '/api/admin/sets'];
        yield 'show' => ['GET', '/api/admin/sets/sabc'];
        yield 'validate' => ['POST', '/api/admin/import/validate'];
        yield 'create' => ['POST', '/api/admin/sets'];
        yield 'update' => ['PUT', '/api/admin/sets/sabc'];
        yield 'delete' => ['DELETE', '/api/admin/sets/sabc'];
        yield 'publish' => ['POST', '/api/admin/sets/sabc/publish'];
        yield 'unpublish' => ['POST', '/api/admin/sets/sabc/unpublish'];
        yield 'upload' => ['POST', '/api/admin/sets/sabc/entries/e1/image'];
        yield 'unknown admin path' => ['POST', '/api/admin/anything'];
    }

    #[DataProvider('protectedRoutes')]
    public function testAdminRoutesRequireLogin(string $method, string $path): void
    {
        $this->json($method, $path, ['title' => 'x', 'entries' => []]);

        self::assertResponseStatusCodeSame(401);
    }

    public function testWrongPasswordIsRejectedAndThrottled(): void
    {
        $this->json('POST', '/api/admin/login', ['username' => 'admin', 'password' => 'nope']);
        self::assertResponseStatusCodeSame(401);

        for ($i = 1; $i < LoginThrottle::MAX_FAILURES; ++$i) {
            $this->json('POST', '/api/admin/login', ['username' => 'admin', 'password' => 'nope']);
        }
        $this->json('POST', '/api/admin/login', ['username' => 'admin', 'password' => self::PASSWORD]);
        self::assertResponseStatusCodeSame(429, 'Even the right password waits once the throttle is engaged.');
    }

    public function testLoginRequiresJsonSoCrossSiteFormsCannotPost(): void
    {
        $this->client->request('POST', '/api/admin/login', ['username' => 'admin', 'password' => self::PASSWORD]);

        self::assertResponseStatusCodeSame(400);
    }

    public function testWritesNeedTheCsrfTokenEvenWhenLoggedIn(): void
    {
        $this->login();
        $this->client->request('POST', '/api/admin/sets', server: ['CONTENT_TYPE' => 'application/json'], content: '{"title":"x","entries":[{"basque":"a","translations":{"es":["b"]}}]}');
        self::assertResponseStatusCodeSame(403);

        $this->client->request('POST', '/api/admin/sets', server: ['CONTENT_TYPE' => 'application/json', 'HTTP_X_CSRF_TOKEN' => 'forged'], content: '{}');
        self::assertResponseStatusCodeSame(403);
    }

    public function testLogoutEndsTheSession(): void
    {
        $token = $this->login();
        $this->json('POST', '/api/admin/logout', [], $token);
        $this->json('GET', '/api/admin/sets');

        self::assertResponseStatusCodeSame(401);
    }

    public function testImportReviewPublishAndEditFlow(): void
    {
        $token = $this->login();

        $sample = (string) file_get_contents(self::samplePath('hiztegia-1-gaia.json'));
        $review = $this->json('POST', '/api/admin/import/validate', ['format' => 'json', 'text' => $sample], $token);
        self::assertTrue($review['valid']);
        self::assertCount(26, $review['draft']['entries']);

        $draft = $review['draft'];
        $draft['title'] = '1.Gaia';
        $created = $this->json('POST', '/api/admin/sets', $draft, $token);
        self::assertResponseStatusCodeSame(201);
        $set = $created['set'];
        self::assertSame('draft', $set['status']);
        self::assertSame([], $this->publicSets(), 'Drafts are not visible to learners.');

        $publish = $this->json('POST', "/api/admin/sets/{$set['id']}/publish", [], $token);
        self::assertResponseStatusCodeSame(409);
        self::assertStringContainsString('week', $publish['error']);

        $entryId = $set['entries'][3]['id'];
        $upload = $this->upload($set['id'], $entryId, $token, $this->pngFile());
        self::assertResponseIsSuccessful();
        self::assertStringStartsWith('/uploads/', $upload['image']);

        $set['weekStart'] = '2026-09-21';
        $this->json('PUT', "/api/admin/sets/{$set['id']}", $set, $token);
        self::assertResponseIsSuccessful();
        $this->json('POST', "/api/admin/sets/{$set['id']}/publish", [], $token);
        self::assertResponseIsSuccessful();

        $public = $this->publicSets();
        self::assertCount(1, $public);
        self::assertSame('2026-09-21', $public[0]['weekStart']);
        self::assertSame($upload['image'], $public[0]['entries'][3]['image']);
        self::assertArrayNotHasKey('imageHint', $public[0]['entries'][0], 'Editorial hints stay admin-only.');

        // Edit later: rename a word, drop the last one, keep ids stable.
        $set = $this->json('GET', "/api/admin/sets/{$set['id']}")['set'];
        $set['entries'][0]['translations']['es'][] = 'papelera';
        array_pop($set['entries']);
        $updated = $this->json('PUT', "/api/admin/sets/{$set['id']}", $set, $token)['set'];
        self::assertSame(array_column($set['entries'], 'id'), array_column($updated['entries'], 'id'));
        self::assertSame($upload['image'], $updated['entries'][3]['image'], 'Images survive edits.');
        self::assertSame(['cubo de la basura', 'papelera'], $updated['entries'][0]['translations']['es']);

        // A published set may not lose its week.
        $updated['weekStart'] = null;
        $this->json('PUT', "/api/admin/sets/{$set['id']}", $updated, $token);
        self::assertResponseStatusCodeSame(422);

        $this->json('DELETE', "/api/admin/sets/{$set['id']}", [], $token);
        self::assertResponseIsSuccessful();
        self::assertSame([], $this->publicSets());
        self::assertSame([], glob($this->uploads.'/*.webp'), 'Deleting a set removes its images.');
    }

    public function testFlaggedEntriesBlockPublishing(): void
    {
        $token = $this->login();
        $created = $this->json('POST', '/api/admin/sets', [
            'title' => 'Unclear', 'weekStart' => '2026-09-21',
            'entries' => [['basque' => 'Loreontzi', 'translations' => ['es' => ['florero']], 'needsReview' => true, 'reviewNote' => 'blurry']],
        ], $token);
        $response = $this->json('POST', "/api/admin/sets/{$created['set']['id']}/publish", [], $token);

        self::assertResponseStatusCodeSame(409);
        self::assertStringContainsString('flagged for review', $response['error']);
    }

    public function testUploadRejectsSvgEvenWithImageExtension(): void
    {
        $token = $this->login();
        $created = $this->json('POST', '/api/admin/sets', ['title' => 'x', 'entries' => [['basque' => 'a', 'translations' => ['es' => ['b']]]]], $token);
        $path = $this->tempDir().'/evil.png';
        file_put_contents($path, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        $response = $this->upload($created['set']['id'], $created['set']['entries'][0]['id'], $token, new UploadedFile($path, 'evil.png', 'image/png', null, true));

        self::assertResponseStatusCodeSame(422);
        self::assertStringContainsString('PNG, JPEG or WebP', $response['error']);
    }

    public function testPublicContentSetsNoCookieAndIgnoresInput(): void
    {
        $this->client->request('GET', '/api/public/content?learner=Ane&score=10');

        self::assertResponseIsSuccessful();
        self::assertSame([], $this->client->getResponse()->headers->getCookies());
        self::assertSame(['schemaVersion', 'sets'], array_keys(json_decode((string) $this->client->getResponse()->getContent(), true)));
    }

    private function login(): string
    {
        $state = $this->json('POST', '/api/admin/login', ['username' => 'admin', 'password' => self::PASSWORD]);
        self::assertResponseIsSuccessful();
        self::assertTrue($state['authenticated']);

        return $state['csrfToken'];
    }

    /** @return list<array<string, mixed>> */
    private function publicSets(): array
    {
        return $this->json('GET', '/api/public/content')['sets'];
    }

    /**
     * @param array<string, mixed> $body
     *
     * @return array<string, mixed>
     */
    private function json(string $method, string $path, array $body = [], ?string $csrf = null): array
    {
        $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'];
        if (null !== $csrf) {
            $server['HTTP_X_CSRF_TOKEN'] = $csrf;
        }
        $this->client->request($method, $path, server: $server, content: 'GET' === $method ? null : json_encode($body, \JSON_THROW_ON_ERROR));

        return json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];
    }

    /** @return array<string, mixed> */
    private function upload(string $setId, string $entryId, string $csrf, UploadedFile $file): array
    {
        $this->client->request('POST', "/api/admin/sets/$setId/entries/$entryId/image", files: ['image' => $file], server: ['HTTP_X_CSRF_TOKEN' => $csrf]);

        return json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];
    }

    private function pngFile(): UploadedFile
    {
        $path = $this->tempDir().'/mochila.png';
        $image = imagecreatetruecolor(64, 64);
        imagepng($image, $path);

        return new UploadedFile($path, 'mochila.png', 'image/png', null, true);
    }
}
