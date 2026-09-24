<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Loads the sample homework once, on the very first start of an empty
 * database, and the built-in categories (samples/topics) once per install,
 * including existing ones. Flags in the meta table make sure deleted or
 * edited sets are never recreated and real content is never overwritten.
 */
final class SampleSeeder
{
    /** Sample file => weeks before the current week (illustrative dates only). */
    private const SAMPLES = [
        'hiztegia-1-gaia.json' => 0,
        'hilabeteak-eta-astegunak.json' => 1,
    ];

    public function __construct(
        private readonly Database $db,
        private readonly SetRepository $sets,
        private readonly ImportValidator $validator,
    ) {
    }

    /** @return list<string> titles of seeded sets */
    public function seedOnce(string $sampleDir, ?\DateTimeImmutable $today = null): array
    {
        if (null !== $this->db->getMeta('samples_seeded')) {
            return [];
        }
        $monday = ($today ?? new \DateTimeImmutable('today', new \DateTimeZone('UTC')))->modify('monday this week');
        $seeded = [];
        foreach (self::SAMPLES as $file => $weeksAgo) {
            $path = $sampleDir.'/'.$file;
            if (!is_file($path)) {
                continue;
            }
            $document = json_decode((string) file_get_contents($path), true, 64, \JSON_THROW_ON_ERROR);
            $document['description'] = trim(($document['description'] ?? '').' Contenido de ejemplo con fecha ilustrativa.');
            $document['weekStart'] = $monday->modify("-$weeksAgo week")->format('Y-m-d');
            $result = $this->validator->validate($document);
            if (!$result->isValid()) {
                throw new \RuntimeException("Sample $file is invalid: ".json_encode($result->errors));
            }
            $id = $this->sets->create($result->draft, isSample: true);
            $this->sets->setStatus($id, 'published');
            $seeded[] = $document['title'];
        }
        $this->db->setMeta('samples_seeded', gmdate('c'));

        return $seeded;
    }

    /**
     * Built-in categories (days of the week, months): real content, not
     * samples, published as they are.
     *
     * @return list<string> titles of seeded sets
     */
    public function seedTopicsOnce(string $topicDir): array
    {
        if (null !== $this->db->getMeta('topics_seeded')) {
            return [];
        }
        $files = glob($topicDir.'/*.json') ?: [];
        sort($files);
        $seeded = [];
        foreach ($files as $path) {
            $document = json_decode((string) file_get_contents($path), true, 64, \JSON_THROW_ON_ERROR);
            $result = $this->validator->validate($document);
            if (!$result->isValid() || 'topic' !== $result->draft['kind']) {
                throw new \RuntimeException('Topic '.basename($path).' is invalid: '.json_encode($result->errors));
            }
            $id = $this->sets->create($result->draft);
            $this->sets->setStatus($id, 'published');
            $seeded[] = $document['title'];
        }
        $this->db->setMeta('topics_seeded', gmdate('c'));

        return $seeded;
    }
}
