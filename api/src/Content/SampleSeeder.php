<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Loads the sample sheets once, on the very first start of an empty
 * database, each built-in topic (samples/topics) once per install,
 * including existing ones, each real school sheet (samples/weeks) once per
 * install, and each starter story (samples/stories) once per install.
 * Flags in the meta table make sure deleted or edited content is never
 * recreated and real content is never overwritten. Content that still has
 * entries flagged for review (for example starter sentences waiting for a
 * Basque speaker) is left as a draft; stories always start as drafts,
 * because they also need generated audio before they can be published.
 */
final class SampleSeeder
{
    private const SAMPLES = ['hiztegia-1-gaia.json', 'hilabeteak-eta-astegunak.json'];

    public function __construct(
        private readonly Database $db,
        private readonly SetRepository $sets,
        private readonly ImportValidator $validator,
        private readonly ?StoryRepository $stories = null,
        private readonly ?StoryValidator $storyValidator = null,
    ) {
    }

    /** @return list<string> titles of seeded sets */
    public function seedOnce(string $sampleDir): array
    {
        if (null !== $this->db->getMeta('samples_seeded')) {
            return [];
        }
        $seeded = [];
        foreach (self::SAMPLES as $file) {
            $path = $sampleDir.'/'.$file;
            if (!is_file($path)) {
                continue;
            }
            $document = json_decode((string) file_get_contents($path), true, 64, \JSON_THROW_ON_ERROR);
            $document['description'] = trim(($document['description'] ?? '').' Contenido de ejemplo.');
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
     * Built-in categories (days, months, word formation): real content, not
     * samples, published as they are.
     *
     * @return list<string> titles of seeded sets
     */
    public function seedTopicsOnce(string $topicDir): array
    {
        $legacySeeded = null !== $this->db->getMeta('topics_seeded');
        $files = glob($topicDir.'/*.json') ?: [];
        sort($files);
        $seeded = [];
        foreach ($files as $path) {
            $key = 'topic_seeded:'.basename($path);
            if (null !== $this->db->getMeta($key) || ($legacySeeded && \in_array(basename($path), ['astegunak.json', 'hilabeteak.json'], true))) {
                continue;
            }
            $document = json_decode((string) file_get_contents($path), true, 64, \JSON_THROW_ON_ERROR);
            $result = $this->validator->validate($document);
            if (!$result->isValid() || 'topic' !== $result->draft['kind']) {
                throw new \RuntimeException('Topic '.basename($path).' is invalid: '.json_encode($result->errors));
            }
            $id = $this->sets->create($result->draft);
            $this->publishIfReady($id);
            $this->db->setMeta($key, gmdate('c'));
            $seeded[] = $document['title'];
        }
        $this->db->setMeta('topics_seeded', gmdate('c'));

        return $seeded;
    }

    /**
     * Real school sheets (samples/weeks; the folder keeps its old name), with
     * the "received on" dates from the files.
     * Each file is seeded once per install, tracked by its name, so a week
     * added to the repo later also reaches existing installs.
     *
     * @return list<string> titles of seeded sets
     */
    public function seedWeeksOnce(string $weekDir): array
    {
        $files = glob($weekDir.'/*.json') ?: [];
        sort($files);
        $seeded = [];
        foreach ($files as $path) {
            $key = 'week_seeded:'.basename($path);
            if (null !== $this->db->getMeta($key)) {
                continue;
            }
            $document = json_decode((string) file_get_contents($path), true, 64, \JSON_THROW_ON_ERROR);
            $result = $this->validator->validate($document);
            if (!$result->isValid() || 'sheet' !== $result->draft['kind']) {
                throw new \RuntimeException('Sheet '.basename($path).' is invalid: '.json_encode($result->errors));
            }
            $id = $this->sets->create($result->draft);
            $this->publishIfReady($id);
            $this->db->setMeta($key, gmdate('c'));
            $seeded[] = $document['title'];
        }

        return $seeded;
    }

    /**
     * Starter listening stories, always as drafts: they need a review by a
     * Basque speaker and generated audio before an admin publishes them.
     *
     * @return list<string> titles of seeded stories
     */
    public function seedStoriesOnce(string $storyDir): array
    {
        if (null === $this->stories || null === $this->storyValidator) {
            return [];
        }
        $files = glob($storyDir.'/*.json') ?: [];
        sort($files);
        $seeded = [];
        foreach ($files as $path) {
            $key = 'story_seeded:'.basename($path);
            if (null !== $this->db->getMeta($key)) {
                continue;
            }
            $document = json_decode((string) file_get_contents($path), true, 64, \JSON_THROW_ON_ERROR);
            $result = $this->storyValidator->validate($document);
            if (!$result->isValid()) {
                throw new \RuntimeException('Story '.basename($path).' is invalid: '.json_encode($result->errors));
            }
            if (null !== $this->stories->find($result->draft['id'])) {
                $this->db->setMeta($key, gmdate('c'));
                continue;
            }
            $this->stories->create($result->draft, isSample: true);
            $this->db->setMeta($key, gmdate('c'));
            $seeded[] = $document['title'];
        }

        return $seeded;
    }

    private function publishIfReady(string $id): void
    {
        $set = $this->sets->find($id);
        if (null !== $set && [] === SetRepository::publishBlockers($set)) {
            $this->sets->setStatus($id, 'published');
        }
    }
}
