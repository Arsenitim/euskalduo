# Architecture notes

```
browser ──HTTP──▶ web (nginx, :8080)
                   ├─ /            built React app (static files)
                   ├─ /uploads/    pictures, read-only volume
                   └─ /api/  ──FastCGI──▶ api (PHP 8.4-FPM + Symfony 8)
                                          ├─ /data/euskalduo.sqlite   (volume "content")
                                          ├─ /uploads/*.webp          (volume "uploads")
                                          └─ /speech/requests.json    (volume "speech-queue")
tts (Python/Piper) ── reads /speech/requests.json and the public catalogue,
                      writes /audio/<key>.mp3, <key>.json, status.json (volume "audio")
```

Only `web` publishes a port. PHP-FPM listens only on the compose network.

## Content storage (server)

SQLite holds **learning content only**, plus a login-throttle counter,
anonymous usage totals and a little metadata. Schema version 8:

* `homework_sets` — one row per *set*: a school **sheet** (stored as
  `kind = 'week'`, the historic value, exposed as `"sheet"`) or a **topic**.
  id, title, `week_start` (exposed as `receivedOn`: when the sheet arrived,
  information only), description, groups JSON, status (`draft`/`published`),
  sample flag, timestamps. `exam_date` is kept from v6 but no longer read.
* `entries` — (set_id, id) primary key, position (explicit order),
  `entry_type` (`word`/`sentence`/`grammar`), basque, translations JSON
  (`{"es": [...], "ru": [...]}`), `exercise_json` (sentence tiles or grammar
  gap), formation JSON, note, group key, emoji, image hint, image file name,
  needs_review, review note.
* `stories` — id, title, format (`short`/`extended`), difficulty 1–3,
  transcript, translations JSON, questions JSON, links JSON, status,
  needs_review, review note, sample flag, timestamps.
* `exams` — id, title, optional exam_date, set_ids JSON, status.
* `usage_daily`, `usage_breakdown` — anonymous counters (see GUIDE, Privacy).

Migrations run in `Database::migrate()` on the first connection: additive
(`ALTER TABLE … ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`), each step
checking what exists, in one transaction, so a database of any earlier
version upgrades in one go and a repeated run changes nothing. v8 turns every
set with an `exam_date` into an exam of that set **with the set's id**, so
old `#/examen/<setId>` links keep working. Nothing is deleted.

Admin credentials come from environment variables, or a generated hash in
`/data/admin-credentials.json`. The API is a small Symfony micro-kernel with
plain PDO (no ORM) — see `api/src/Content`.

Endpoints:

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/public/content` | anyone | One response with everything published: `sets` (with entries), `stories` (only those whose audio matches the current transcript, with `audio` URL and measured `durationMs`) and `exams`. `schemaVersion: 2`. No input, no cookies, no session. ETag for cheap revalidation. |
| `POST /api/public/feedback` | anyone | Learner feedback (multipart: `message`, optional `name`, `page`, `viewport`, `screenshot`). Stored as files, rate-limited per IP, total size capped. The only learner request with a body, sent only from the feedback form. |
| `POST /api/public/stats` | anyone | Anonymous usage counters (JSON: optional `day`, `newDevice`, `activeToday`, `activeWeek`, `answers`, `rounds`, `breakdown`), added to one row of totals per day (`usage_daily`) and, for `breakdown` (up to 100 `{dimension, key, answers, rounds}` rows: set id, story id, exercise type, mode, connection, display), to `usage_breakdown`; unknown labels and ids are ignored. Modes: `lesson`, `topic`, `listening`, `exam` (and the old `week`/`mix`, still accepted for queued counters). `day` (device date, for counters queued offline) is used if within the last 30 days or tomorrow, otherwise today (UTC). No id, no IP; each counter capped at 500 per request. |
| `GET /api/admin/stats` | admin | Totals, the last 30 days, the last 8 weeks and the 30-day breakdowns for **Admin → Usage**. |
| `GET /api/health` | anyone | Health check. |
| `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/session` | admin | Session login (JSON body required). |
| `GET/POST /api/admin/sets`, `GET/PUT/DELETE /api/admin/sets/{id}` | admin | CRUD. The same validator runs for import and every save. |
| `POST /api/admin/sets/{id}/publish` / `unpublish` | admin | Publishing requires entries and none flagged for review. No date. |
| `GET/POST /api/admin/stories`, `GET/PUT/DELETE /api/admin/stories/{id}`, `POST …/publish` / `unpublish`, `POST /api/admin/stories/validate` | admin | Stories with their audio state (`ready`/`pending`/`failed`, duration, last error), publish blockers and warnings. Publishing needs: no review flag, valid links, audio for the exact transcript, duration within the format's limits. Saving a published story that no longer qualifies (e.g. new text without audio) unpublishes it. |
| `GET/POST /api/admin/exams`, `PUT/DELETE /api/admin/exams/{id}`, `POST …/publish` / `unpublish` | admin | Exams: title, optional date, existing set ids. |
| `POST/DELETE /api/admin/sets/{id}/entries/{entryId}/image` | admin | Picture upload (re-encoded) / removal. |
| `POST /api/admin/import/validate` | admin | Parse JSON (schemaVersion 1 or 2) or quick lines; return a normalised draft, per-entry errors and warnings. Saves nothing. |

`AdminGuardSubscriber` protects every `/api/admin/*` path (even unknown ones)
before routing: a session is required, and state-changing requests need the
per-session `X-CSRF-Token`. The session cookie is `HttpOnly`,
`SameSite=Strict`, and `Secure` when served over HTTPS (directly or with
`X-Forwarded-Proto: https`). Failed logins are throttled globally (10 per
15 minutes) so no IP addresses need to be stored.

## Learner state (browser only)

Everything about a learner is in `localStorage` key `euskalduo.learner.v1`
(`web/src/learner/progress.ts`), now holding **state version 2**:

* `displayName`, `lang` (meaning language), `sound`.
* `entries` — review boxes per item, keyed `"<setId>/<entryId>"`, exactly as
  in version 1 (words, and now sentences and grammar items too).
* `skills` — per word, separate `recognition` (meaning/Basque choice, typed
  meaning) and `spelling` records: seen, correct, right-in-a-row, last date.
* `stories` — per story id: plays, completions, questions right/answered,
  completions with the text open ("supported"), passes, last date.
* `sets` — rounds and best stars per set (topic practice).

Version 1 data (from storage or an old export file) is migrated when read:
every `entries` and `sets` record is kept unchanged, `skills` and `stories`
start empty (nothing is invented), the old pinned "current week" is dropped.
Reading version 2 again changes nothing, so the migration is repeatable; the
storage key stays the same. Records are validated on load and on import;
invalid ones are dropped individually. Export/import is a local JSON file
download and file read — nothing is uploaded.

The learner app fetches content with one API call (`fetchContent` in
`web/src/api/public.ts`, which also normalises catalogues of older servers or
older offline copies) with `credentials: 'omit'` and no parameters; the
other learner requests are the anonymous counters (`stats.ts`), feedback
(`feedback.ts`), speech and story clips (`audio.ts`) and the offline download
(`offline.ts`). An ESLint rule forbids calling `fetch` anywhere else in
learner code. Learner routes use the URL fragment (`#/leccion`, `#/tema/…`,
`#/escuchar/…`), which browsers never send to the server. Old week-era
fragments (`#/semanas`, `#/semana/…`, `#/categoria/…`, `#/mezclar`,
`#/practicar?modo=semana…`) redirect to their replacements
(`legacyRedirect` in `web/src/learner/routes.ts`).

## Offline mode

`web/sw/sw.js` is a hand-written service worker. The `serviceWorker` plugin
in `web/vite.config.ts` fills in the build's file list and a version hash and
emits `/sw.js`; it is registered only by the learner app in production builds
(`registerServiceWorker` in `web/src/api/offline.ts`).

| Request | Strategy | Cache |
| --- | --- | --- |
| Page navigations | network first, saved `/` after 5 s or when offline | `euskalduo-shell-<version>` (precached on install, old versions deleted on activate) |
| `/assets/*`, icons, manifest | cache first | same |
| `GET /api/public/content` | network first (5 s), saved copy as fallback; also saved on install | `euskalduo-data-v1` |
| `/uploads/*.webp`, `/audio/*.mp3` | cache first (names are content-addressed) | `euskalduo-media-v1` |
| `/admin*`, `/api/admin/*`, other `/api/*`, POSTs | not handled | — |

**Ajustes → Usar sin conexión** (`learner/components/Offline.tsx`) downloads
the catalogue plus every picture, word clip and story recording it refers to
(`mediaUrls`); ordinary start-up downloads none of them, and a story's
recording is cached when it is first played, asks for persistent
storage, and shows whether everything is saved. A successful download sets
`euskalduo.offline.v1` in `localStorage`; only then does the home screen's
"Novedades para descargar" pill appear (online, when media is missing). The
header shows a ✈️ pill whenever the browser reports no connection. Media no longer in the
catalogue is pruned after each content load. Usage counters are queued per day
in `localStorage` (`euskalduo.stats.pending.v1`) and flushed oldest first on
each answer, at start-up and on the `online` event; a chunk is removed from
the queue before it is sent and put back if sending fails. Playwright blocks
service workers except in `e2e/offline.spec.ts`, because `page.route()` cannot
see requests the worker answers.

## Practice logic

`web/src/learner/questions.ts` (rounds), `scheduler.ts` (boxes and weights),
`story.ts` (listening) and `lessonConfig.ts` (all round-shaping numbers).

There are no weeks in learning. Every published set — school sheets and
topics alike — is one catalogue; sets keep their titles, groups and notes,
and every item keeps its own id and progress.

* **Boxes (Leitner).** Each item is in box 0–5. The first answer to it in a
  round moves it up one box if right, back to box 0 if wrong or skipped
  ("No lo sé"), and leaves it where it is if the hint was used. An item in box
  *b* is due again after 0, 1, 2, 4, 7, 14 days. Missing days never moves an
  item down. Box ≥ 3 counts as "learned".
* **Item weights.** Missed last time (box 0) 4 › never seen 3 › due 2–3
  (lower boxes higher) › not due 0.4, so well-known words still come back now
  and then.
* **"Empezar" lessons** (`mode: lesson`) draw from the whole catalogue:
  * 10 questions (`LESSON.length`); a story block takes the place of 3.
  * Words are picked in two stages: a collection, with a chance proportional
    to the square root of its total weight (`collectionExponent`), then an
    item in it by weight. At most 4 words per collection
    (`maxPerCollection`) and at most 40 % never-seen words (`maxNewShare`);
    these limits give way only when the catalogue is too small.
  * Once a Basque spelling is picked, other occurrences of it (the same word
    on another sheet) are skipped for that lesson. Their progress stays
    separate: nothing is merged.
  * Up to 2 sentence-building / grammar items (`maxStructured`), sometimes
    one word-building item (`wordBuildChance`) and sometimes one ordering task
    (`orderChance`). Not every type has to appear in every lesson.
  * A **short story** is included in about 60 % of lessons
    (`listeningChance`) when a suitable one exists: published with audio, not
    heard in the last 3 days, difficulty ≤ the learner's listening level (1,
    then 2 after understanding two stories, 3 after four), and either
    difficulty 1 or at least half of its linked words already practised.
    Spelling scores alone never decide it. It is placed in the second half,
    never first.
* **Topic practice** (`mode: collection`, from **Temas**): all questions from
  that sheet or topic, except at most 2 (≤ 20 %) for *due, already practised*
  words from elsewhere; one compound and one derived word-building task when
  available; an ordering task for ordered groups.
* **Exams** (`mode: exam`): the exam's sets only, ignoring the review
  calendar: every item keeps circulating, weakest first (wrong 4 › unseen 3 ›
  box-weighted ≥ 1). Boxes and stars are recorded as usual, and the material
  stays in normal lessons.
* **Exercise types.** Basque → choose meaning; meaning (or picture) → choose
  Basque; spell with letter tiles (typed for terms > 14 letters); type the
  meaning (box ≥ 2); order a run of up to 5 items from an ordered group;
  build a word (compound or derived); **build a sentence** from curated tiles
  (repeats allowed, extra tiles possible; accepted orders are listed
  explicitly); **fill a grammar gap** with one of the curated options (any
  listed answer is right). New words start with recognition; harder types
  appear as the box rises; a type already used for a word in the round is
  rarely repeated.
* **Distractors.** Words only (never sentences). Prefer words from the same
  set. Never offer another accepted gloss of the target, a word sharing any
  meaning with the target, or a word with the same Basque spelling; labels are
  unique ignoring case/accents. With too few candidates, multiple choice is
  skipped rather than showing an impossible question.
* **Answer checking.** Case and extra spaces are ignored; every configured
  alternative is accepted. For meanings, a leading Spanish article is optional
  and missing accents count as "almost" (accepted, correct spelling shown).
  Basque terms must match letter for letter (no morphological relaxation).
  Sentences compare tile texts, so identical tiles are interchangeable.
* **Skills.** Each word answer (not retries) also updates that word's
  `recognition` or `spelling` record; sentences and grammar items have their
  own boxes; stories have their own records. Success in one never counts for
  another: the progress page shows each skill separately.
* **Retries.** A missed item comes back three questions later with a
  different exercise type (sentences and grammar: the same activity, newly
  shuffled), at most 4 per round, or 2 in a lesson with a story. A retry is
  never placed inside or right before a story block (it goes right after).
  Retries do not change boxes or stars.
* **Hints and skips.** Spelling and sentence building offer **💡 Pista**
  once: it fills in the first third of the letters or tiles (rounded up,
  never all), which then cannot be erased. **No lo sé** skips; it counts as
  wrong, so the item comes back.
* **Stars.** Each question's first answer scores 1 point, ½ with the hint,
  0 if wrong or skipped. A story block counts as **one** question: right
  answers / questions, halved if the text was opened before answering; a
  skipped or unplayable story is not scored. Points / questions ≥ 90 % →
  3 stars, ≥ 60 % → 2, otherwise 1. Finishing always earns at least one star.

### Listening blocks

`web/src/learner/components/StoryBlock.tsx`. Title, a short instruction and
**Escuchar** — nothing plays on its own. The recording has its own audio
element; starting it stops word speech and sound effects, and word speech is
never started during a block (the transcript is never sent to the word
voice). Pause, continue, *Desde el principio* and *Saltar* are always
available; replaying has no cost. Questions appear once playback has started,
in the learner's meaning language (Spanish or Russian), with the story audio
in Basque. *Ver el texto* shows the Basque transcript and the translation;
opening it before every question is answered marks the result as supported,
opening it afterwards changes nothing. With sound off, the block offers
*Escuchar igualmente* (for this story only) or skipping. If the recording
cannot be loaded (missing, offline and not saved), the block says so and
continues without scoring or recording anything. Option order is shuffled
each time a story is served.

Results go only to `state.stories[id]` — never to word boxes, so a wrong
answer does not reset the words of the story, and a right one does not mark
them as learned. A *pass* (shown as "Entendida") needs every question right
for short stories, ≥ 75 % for extended ones, without the text.

## Pre-generated speech

A CPU-limited Python/Piper worker reads the texts the API lists in the
`speech-queue` volume (every word, sentence and story transcript, drafts
included) and the public catalogue over the internal Compose network, and
writes content-addressed MP3s, each with a `<key>.json` holding its measured
duration, into an `audio` volume, plus `status.json` with failures. PHP adds
an optional nullable `audio` URL to catalogue entries only for completed
clips, and lists a story only when its clip exists. nginx serves the
volume read-only at `/audio/`, without access logging. Synthesis never runs in
a web request. See [VOICE.md](VOICE.md) for setup, playback rules and credits.
