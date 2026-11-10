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
    private string $audio;

    protected function setUp(): void
    {
        $data = $this->tempDir();
        $this->uploads = $this->tempDir();
        $this->audio = $this->tempDir();
        foreach (['DATA_DIR' => $data, 'UPLOAD_DIR' => $this->uploads, 'AUDIO_DIR' => $this->audio, 'SPEECH_DIR' => $this->tempDir(), 'ADMIN_USERNAME' => 'admin', 'ADMIN_PASSWORD' => self::PASSWORD] as $k => $v) {
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
        yield 'usage stats' => ['GET', '/api/admin/stats'];
        yield 'stories' => ['GET', '/api/admin/stories'];
        yield 'story create' => ['POST', '/api/admin/stories'];
        yield 'story validate' => ['POST', '/api/admin/stories/validate'];
        yield 'story publish' => ['POST', '/api/admin/stories/st1/publish'];
        yield 'exams' => ['GET', '/api/admin/exams'];
        yield 'exam create' => ['POST', '/api/admin/exams'];
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

        $entryId = $set['entries'][3]['id'];
        $upload = $this->upload($set['id'], $entryId, $token, $this->pngFile());
        self::assertResponseIsSuccessful();
        self::assertStringStartsWith('/uploads/', $upload['image']);

        // Publishing needs no date.
        $this->json('POST', "/api/admin/sets/{$set['id']}/publish", [], $token);
        self::assertResponseIsSuccessful();

        $public = $this->publicSets();
        self::assertCount(1, $public);
        self::assertSame(['sheet', null], [$public[0]['kind'], $public[0]['receivedOn']]);
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

        // A published set may not gain an entry that needs review.
        $updated['entries'][0]['needsReview'] = true;
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
            'title' => 'Unclear',
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
        self::assertSame(['schemaVersion', 'sets', 'stories', 'exams'], array_keys(json_decode((string) $this->client->getResponse()->getContent(), true)));
    }

    public function testStoryNeedsMatchingAudioBeforePublishingAndAnEditTakesItOffline(): void
    {
        $token = $this->login();
        $set = $this->json('POST', '/api/admin/sets', ['title' => 'Words', 'entries' => [['id' => 'eskola', 'basque' => 'eskola', 'translations' => ['es' => ['escuela']]]]], $token)['set'];
        $this->json('POST', "/api/admin/sets/{$set['id']}/publish", [], $token);

        $document = self::story() + ['links' => ['entries' => [$set['id'].'/eskola'], 'words' => ['eskola', 'hegazkina']]];
        $review = $this->json('POST', '/api/admin/stories/validate', ['text' => json_encode($document)], $token);
        self::assertTrue($review['valid'], json_encode($review['errors']));
        self::assertStringContainsString('hegazkina', implode(' ', array_column($review['warnings'], 'message')), 'unknown words are pointed out');

        $story = $this->json('POST', '/api/admin/stories', $review['draft'], $token)['story'];
        self::assertResponseStatusCodeSame(201);
        self::assertSame('pending', $story['audio']['state']);
        $refused = $this->json('POST', "/api/admin/stories/{$story['id']}/publish", [], $token);
        self::assertResponseStatusCodeSame(409);
        self::assertStringContainsString('No audio', $refused['error']);

        // The worker's output for exactly this transcript: a clip plus its measured duration.
        $this->fakeClip($story['transcript'], 55000);
        $refused = $this->json('POST', "/api/admin/stories/{$story['id']}/publish", [], $token);
        self::assertResponseStatusCodeSame(409, 'a 55 s clip is too long for a short story');
        $this->fakeClip($story['transcript'], 28000, overwrite: true);
        $this->json('POST', "/api/admin/stories/{$story['id']}/publish", [], $token);
        self::assertResponseIsSuccessful();

        $content = $this->publicContent();
        self::assertCount(1, $content['stories']);
        self::assertSame(28000, $content['stories'][0]['durationMs']);
        self::assertStringStartsWith('/audio/', $content['stories'][0]['audio']);
        self::assertArrayNotHasKey('needsReview', $content['stories'][0]);

        // Editing the spoken text: the old clip no longer matches, so the story leaves the catalogue.
        $edited = $this->json('GET', "/api/admin/stories/{$story['id']}")['story'];
        $edited['transcript'] .= ' Amaiera.';
        $saved = $this->json('PUT', "/api/admin/stories/{$story['id']}", $edited, $token)['story'];
        self::assertSame(['draft', 'pending'], [$saved['status'], $saved['audio']['state']]);
        self::assertSame([], $this->publicContent()['stories']);
    }

    public function testStoryValidationRejectsInconsistentQuestions(): void
    {
        $token = $this->login();
        $bad = self::story();
        $bad['questions'][0]['correct'] = 3;
        $bad['questions'][0]['options'][1]['es'] = $bad['questions'][0]['options'][0]['es'];
        $review = $this->json('POST', '/api/admin/stories/validate', ['text' => json_encode($bad)], $token);
        self::assertFalse($review['valid']);
        self::assertEqualsCanonicalizing(['questions[0].options', 'questions[0].correct'], array_column($review['errors'], 'path'));

        $tooMany = self::story();
        $tooMany['questions'] = array_fill(0, 3, $tooMany['questions'][0]);
        self::assertFalse($this->json('POST', '/api/admin/stories/validate', ['text' => json_encode($tooMany)], $token)['valid'], 'short stories have 1–2 questions');
    }

    public function testExamsSelectSetsAndHaveAnOptionalDate(): void
    {
        $token = $this->login();
        $a = $this->json('POST', '/api/admin/sets', ['title' => 'A', 'entries' => [['basque' => 'a', 'translations' => ['es' => ['b']]]]], $token)['set'];
        $b = $this->json('POST', '/api/admin/sets', ['title' => 'B', 'entries' => [['basque' => 'c', 'translations' => ['es' => ['d']]]]], $token)['set'];
        $this->json('POST', "/api/admin/sets/{$a['id']}/publish", [], $token);

        $this->json('POST', '/api/admin/exams', ['title' => 'Azterketa', 'setIds' => ['nope']], $token);
        self::assertResponseStatusCodeSame(422);
        $exam = $this->json('POST', '/api/admin/exams', ['title' => 'Azterketa', 'examDate' => null, 'setIds' => [$a['id'], $b['id']]], $token)['exam'];
        self::assertResponseStatusCodeSame(201);
        self::assertSame([], $this->publicContent()['exams'], 'drafts are hidden');
        $this->json('POST', "/api/admin/exams/{$exam['id']}/publish", [], $token);
        self::assertSame([['id' => $exam['id'], 'title' => 'Azterketa', 'examDate' => null, 'setIds' => [$a['id']]]], $this->publicContent()['exams'], 'only published sets are listed');
        self::assertCount(1, $this->publicSets(), 'an exam never removes material from ordinary practice');
    }

    /** @return array<string, mixed> */
    private static function story(): array
    {
        return [
            'schemaVersion' => 2, 'type' => 'story', 'id' => 'triku-eskolan', 'title' => 'Triku eskolan',
            'format' => 'short', 'difficulty' => 1,
            'transcript' => 'Triku eskolara doa. Txapi ere eskolara doa.',
            'translations' => ['es' => 'Triku va a la escuela. Txapi también va a la escuela.', 'ru' => 'Трику идёт в школу. Чапи тоже идёт в школу.'],
            'questions' => [[
                'id' => 'q1',
                'prompt' => ['es' => '¿Adónde va Triku?', 'ru' => 'Куда идёт Трику?'],
                'options' => [['es' => 'A la escuela', 'ru' => 'В школу'], ['es' => 'A casa', 'ru' => 'Домой'], ['es' => 'Al parque', 'ru' => 'В парк']],
                'correct' => 0,
            ]],
        ];
    }

    private function fakeClip(string $text, int $durationMs, bool $overwrite = false): void
    {
        $store = static::getContainer()->get(\App\Content\AudioStore::class);
        $key = $store->key($text);
        file_put_contents($this->audio."/$key.mp3", 'clip');
        file_put_contents($this->audio."/$key.json", json_encode(['durationMs' => $durationMs]));
        clearstatcache();
    }

    /** @return array<string, mixed> */
    private function publicContent(): array
    {
        $this->client->request('GET', '/api/public/content');

        return json_decode((string) $this->client->getResponse()->getContent(), true);
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
