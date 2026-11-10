<?php

// Container start-up: prepare the database, admin credentials and (once)
// the sample content. Safe to run on every start.

declare(strict_types=1);

use App\Content\Database;
use App\Content\ImportValidator;
use App\Content\SampleSeeder;
use App\Content\SetRepository;
use App\Content\SpeechQueue;
use App\Content\StoryRepository;
use App\Content\StoryValidator;
use App\Security\AdminCredentials;

require dirname(__DIR__).'/vendor/autoload.php';

$dataDir = getenv('DATA_DIR') ?: '/data';
$db = new Database($dataDir);
$db->pdo();

$credentials = new AdminCredentials(
    $dataDir,
    getenv('ADMIN_USERNAME') ?: 'admin',
    getenv('ADMIN_PASSWORD') ?: '',
    getenv('ADMIN_PASSWORD_HASH') ?: '',
);
$generated = $credentials->ensureConfigured();
if (null !== $generated) {
    fwrite(STDOUT, "\n==============================================================\n");
    fwrite(STDOUT, "EUSKALDUO admin account created (shown only once):\n");
    fwrite(STDOUT, '  username: '.$credentials->username()."\n");
    fwrite(STDOUT, '  password: '.$generated."\n");
    fwrite(STDOUT, "Set ADMIN_PASSWORD in .env to choose your own instead.\n");
    fwrite(STDOUT, "==============================================================\n\n");
} else {
    fwrite(STDOUT, 'Admin credentials source: '.$credentials->source()."\n");
    if ($credentials->isWeakEnvPassword()) {
        fwrite(STDOUT, "WARNING: ADMIN_PASSWORD is shorter than 12 characters.\n");
    }
}

if (filter_var(getenv('SEED_SAMPLE_CONTENT') ?: 'true', FILTER_VALIDATE_BOOL)) {
    $sampleDir = getenv('SAMPLE_DIR') ?: dirname(__DIR__).'/samples';
    $seeder = new SampleSeeder($db, new SetRepository($db), new ImportValidator(), new StoryRepository($db), new StoryValidator());
    foreach ($seeder->seedOnce($sampleDir) as $title) {
        fwrite(STDOUT, "Seeded sample set: $title\n");
    }
    foreach ($seeder->seedTopicsOnce($sampleDir.'/topics') as $title) {
        fwrite(STDOUT, "Seeded category: $title\n");
    }
    foreach ($seeder->seedWeeksOnce($sampleDir.'/weeks') as $title) {
        fwrite(STDOUT, "Seeded sheet: $title\n");
    }
    foreach ($seeder->seedStoriesOnce($sampleDir.'/stories') as $title) {
        fwrite(STDOUT, "Seeded story (draft, needs review and audio): $title\n");
    }
}

// Tell the speech worker which texts need clips (drafts included).
$queue = new SpeechQueue(getenv('SPEECH_DIR') ?: '/speech', new SetRepository($db), new StoryRepository($db));
fwrite(STDOUT, $queue->refresh() ? "Speech queue updated.\n" : "Speech queue directory not available; only published texts get audio.\n");
