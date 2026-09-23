<?php

// Container start-up: prepare the database, admin credentials and (once)
// the sample content. Safe to run on every start.

declare(strict_types=1);

use App\Content\Database;
use App\Content\ImportValidator;
use App\Content\SampleSeeder;
use App\Content\SetRepository;
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
    $repository = new SetRepository($db);
    $seeded = (new SampleSeeder($db, $repository, new ImportValidator()))
        ->seedOnce(getenv('SAMPLE_DIR') ?: dirname(__DIR__).'/samples');
    foreach ($seeded as $title) {
        fwrite(STDOUT, "Seeded sample set: $title\n");
    }
}
