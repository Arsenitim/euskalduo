<?php

// Feedback housekeeping, run inside the api container:
//   docker compose exec api php bin/feedback.php stats
//   docker compose exec api php bin/feedback.php purge-through <id>
// Download first (see docs/GUIDE.md), then purge what you downloaded.

declare(strict_types=1);

use App\Feedback\FeedbackStore;

require dirname(__DIR__).'/vendor/autoload.php';

$maxMb = (int) (getenv('FEEDBACK_MAX_MB') ?: 256);
$store = new FeedbackStore(getenv('DATA_DIR') ?: '/data', $maxMb);

switch ($argv[1] ?? '') {
    case 'stats':
        $ids = $store->ids();
        printf("entries: %d\nused: %.1f MB of %d MB\n", count($ids), $store->usedBytes() / 1048576, $maxMb);
        if ([] !== $ids) {
            printf("oldest: %s\nnewest: %s\n", $ids[0], $ids[count($ids) - 1]);
        }
        break;
    case 'purge-through':
        try {
            printf("deleted %d entries\n", $store->purgeThrough($argv[2] ?? ''));
        } catch (InvalidArgumentException $e) {
            fwrite(STDERR, $e->getMessage()."\n");
            exit(1);
        }
        break;
    default:
        fwrite(STDERR, "usage: php bin/feedback.php stats | purge-through <id>\n");
        exit(1);
}
