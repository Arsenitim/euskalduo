# EUSKALDUO — full guide

A playful web app for practising Basque (Euskara) from real school
material. A parent (the admin) imports each sheet when it arrives, checks it
and publishes it. Children practise in short rounds on a tablet, phone or
computer, with no accounts, ads, leaderboards or streak penalties.

* **Learners:** one big **Empezar** button starts a lesson chosen for them
  from everything published — words, varied topics and listening. Nothing to
  pick first, no weeks or dates. **Temas** practises one topic or one school
  sheet on its own (days of the week, months, word formation, sentences,
  grammar and every sheet are there). **Escuchar** has short and longer
  Basque stories with comprehension questions. An exam section appears when
  the admin announces an exam.
* **Exercises:** choose the meaning, choose the Basque word, spell with
  letter tiles, type the meaning, put months/weekdays in order, build words
  from words or suffixes, **build a sentence** from tiles, **fill a grammar
  gap**, and **listening comprehension**. Spelling and sentences have a
  💡 hint (half credit) and "No lo sé" to skip; immediate feedback; missed
  items come back later; stars at the end of a round; progress per skill and
  topic; pre-generated Basque voice and short sound effects (mute both with
  🔊 or in Ajustes; see [VOICE.md](VOICE.md)). An animated mascot, Triku the
  hedgehog or Txapi the sheep, reacts only occasionally: on streaks (3, 7, 12
  in a row, then every 5), an item fixed on its retry, a second miss in a
  row, or a 10% surprise, never twice within 3 answers. Both mascots appear
  on the round summary. The child-facing UI is simple Spanish; meanings and
  story questions can be shown in Spanish or Russian. Basque vocabulary
  labels and Spanish translations use sentence case; imported spelling and
  existing audio files are preserved.
* **Admin:** log in, paste/upload JSON (or quick `Basque — Spanish` lines),
  review with per-entry errors and warnings, add pictures, preview,
  publish/unpublish, edit and delete sheets and topics; manage **stories**
  (text, translations, questions, links, audio status, preview) and
  **exams** (a selection of sheets/topics with an optional date).
* **Privacy:** the server stores only learning content, anonymous usage
  totals, and feedback that someone deliberately sends. Names, answers and
  progress stay in the child's browser.
* **Feedback:** a *Comentarios* button opens a form (message, optional name
  and screenshot). Entries are stored as files for you to download.

## Quick start

Requirements: Docker with the Compose plugin.

```sh
cp .env.example .env          # optional: set ADMIN_PASSWORD, port, etc.
docker compose up --build
```

* Learner app: <http://127.0.0.1:8765/>
* Admin: <http://127.0.0.1:8765/admin/>. The username is `admin`.
  If you did not set `ADMIN_PASSWORD` in `.env`, a random password is generated
  on the first start and printed **once** in the log:

  ```sh
  docker compose logs api | grep -A3 "admin account"
  ```

  Missed it (logs are gone once the container is removed)? Set
  `ADMIN_PASSWORD` in `.env` and run `docker compose up -d`.

On first start, two published **sample** sheets are loaded (badge
"Ejemplo"), plus the built-in topics and the real sheets in `samples/`.
Starter **stories** and the **Esaldiak** (sentences) and **Gramatika** topics
are loaded as drafts flagged *Needs review*: they were written without a
Basque speaker's check, so children see them only after you (or a speaker)
review and publish them. Deleted samples are never re-created.

### First steps as admin

1. Photograph the school sheet. Give the photo to ChatGPT with the prompt in
   [`CHATGPT_IMPORT_INSTRUCTIONS.md`](../CHATGPT_IMPORT_INSTRUCTIONS.md).
2. **Admin → Import**: paste the JSON (or upload the `.json` file). To try
   it out, press **Load example**. A story JSON (`"type": "story"`) is
   recognised and saved as a draft story.
3. **Check & review**: fix errors, look at the warnings, choose *School
   sheet* or *Topic*, and clear any "Needs review" flags. A date is optional
   ("Received on", for reference only). Then **Save as draft**.
4. Optional: upload a picture for concrete words (PNG/JPEG/WebP ≤ 5 MB).
5. **Preview**, then **Publish**. Learners see only published sets, and every
   published set is part of their lessons straight away.
6. Stories: **Admin → Stories**. Check the text, translations and questions,
   wait until the audio shows *ready* with its length (the speech worker
   needs a few minutes), clear *Needs review*, then **Publish**.
7. Exams: **Admin → Exams** → title, optional date, tick the sheets/topics
   it covers, **Publish**.

## Configuration (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `EUSKALDUO_BIND` | `127.0.0.1` | Host address to publish on. Use `0.0.0.0` for your LAN (read "Before sharing" below first). |
| `EUSKALDUO_BIND6` | `[::1]` | IPv6 address to publish on. Use `[::]` with `EUSKALDUO_BIND=0.0.0.0` on a home network: phones often resolve `name.local` to IPv6 first. |
| `EUSKALDUO_PORT` | `8765` | Host port. |
| `ADMIN_USERNAME` | `admin` | Admin login name. |
| `ADMIN_PASSWORD` | *(empty)* | Admin password (≥ 12 characters recommended). Empty + no hash → a password is generated once. |
| `ADMIN_PASSWORD_HASH` | *(empty)* | Alternative to the plain password: a `password_hash()` bcrypt/argon2 hash. Write every `$` as `$$` in `.env`. |
| `APP_SECRET` | *(generated)* | Symfony secret. It is generated into the data volume if empty. |
| `FEEDBACK_MAX_MB` | `256` | Total size of stored feedback. When it is reached, new feedback is refused until you purge what you have downloaded. |
| `FEEDBACK_CONTACT` | *(empty)* | Name shown to learners when the feedback box is full ("escribe directamente a …"). |
| `FPM_MAX_CHILDREN` | `8` | Max PHP worker processes (started on demand). Use 2–3 on a 512 MB server. |
| `EUSKALDUO_API_MEM_LIMIT` / `EUSKALDUO_WEB_MEM_LIMIT` | `512m` / `128m` | Container memory caps, so the app cannot starve other services on a shared host. |
| `SEED_SAMPLE_CONTENT` | `true` | Load the sample sets into an empty database on first start. |

To change the admin password later, set `ADMIN_PASSWORD` (it takes precedence
over the generated one) and run `docker compose up -d`.

**Existing Traefik setup:** `compose.traefik.example.yaml` is an optional
overlay. It removes the host port and adds router labels. Set `EUSKALDUO_HOST`,
`TRAEFIK_NETWORK` (the Docker network Traefik watches), `TRAEFIK_ENTRYPOINT`
and `TRAEFIK_CERTRESOLVER` in `.env`, then run
`docker compose -f compose.yaml -f compose.traefik.example.yaml up -d`.
The base setup does not need it.

**Small shared servers:** build the images on another machine rather than on
the server (the frontend build needs several hundred MB of RAM). Copy them over
with `docker save euskalduo-api euskalduo-web | gzip | ssh server 'gunzip | docker load'`,
then start with `docker compose ... up -d --no-build`. At idle the app uses
about 25 MB of RAM.

**Home screen.** Learners can add the site to their home screen (Android:
browser menu → *Add to Home screen* / *Install app*; iPhone: Safari → Share →
*Add to Home Screen*). It then opens full screen with the EUSKALDUO icon. The
icons are rendered from `web/icons/app-icon.svg` with `node web/icons/render.mjs`.

**Offline (e.g. on a plane).** After one visit with a connection, the learner
app opens and can be practised without one: a service worker (`web/sw/sw.js`)
keeps the app and the last catalogue. Pictures, speech and story recordings
are kept once played; **Ajustes → Usar sin conexión → Descargar** saves all of
them (stories included) at once and says when everything is ready. A story
whose recording is not saved shows a short notice offline and the lesson
simply continues. While offline a ✈️ pill in the header (a badge on
the logo on phones) says so, and the home screen explains it. Lessons hide the
header so the question and **Siguiente** fit on a phone screen. On a device that
has downloaded before, the home screen shows **⬇️ Novedades para descargar**
(online only) when the catalogue has pictures or speech it has not saved yet,
e.g. a new sheet, a new story or clips generated later; it opens Ajustes. Progress is local
anyway, and the anonymous usage counters wait on the device and are sent,
filed under the day they happened, when the connection returns. When online,
the page and catalogue always come from the network first, so updates still
arrive on the next visit (after 5 s without an answer the saved copy is used).
On iPhone/iPad, add the app to the Home Screen and open it from there:
otherwise Safari may clear site data (including progress) after about a week
without use. The admin UI is never cached.

## Import format

The canonical format is versioned JSON (`schemaVersion: 1`). It is documented
in [`docs/IMPORT_FORMAT.md`](IMPORT_FORMAT.md) and
[`samples/homework.schema.json`](../samples/homework.schema.json). Key points:

* `translations.es` is a **list**. Each alternative (e.g. `campeonato`,
  `concurso`) is accepted on its own; commas are never split silently.
* Sets are *sheets* or *topics*; no date is needed. Old files with
  `weekStart`/`"kind": "week"` are still accepted (the date is kept only as
  "received on").
* Entries can be words, **sentences** (curated tiles, explicit accepted
  orders) or **grammar** gaps (curated answers and wrong options).
* **Stories** have their own format (`"type": "story"`).
* Optional `groups` with `ordered: true` (months, weekdays) keep the source
  order and enable the ordering exercise.
* `needsReview` marks unclear items; flagged sets cannot be published.
* `imageHint` is an editorial suggestion only, never shown to learners and
  never a URL.

## Privacy

* **No learner data on the server.** There are no learner accounts. Names,
  answers, scores and progress are stored in the browser's `localStorage`
  only. The learner app downloads content with one request, `GET /api/public/content`, with no
  parameters, no body and no cookies. It downloads everything published, so
  the server does not even learn which topic or story a child opens. Learner pages use
  `#` URLs, which browsers do not send to the server.
* **No third parties.** No analytics, ads, trackers, external fonts, CDNs or
  external images. A Content-Security-Policy restricts everything to the same
  origin.
* **Anonymous usage counters.** While practising, the app posts small
  counters to `POST /api/public/stats`: one answer (right / with hint / wrong
  / skipped) or one finished round, plus three yes/no flags sent at most once:
  "new device" (ever), "active today" (per day) and "active this week" (per
  Monday–Sunday week). The browser remembers in
  `localStorage` (`euskalduo.stats.v1`) that it already sent them; there is no
  device id. Each answer and round is also counted per set or story (their
  public ids), exercise type, practice mode (lesson / topic / listening /
  exam), online or offline, and installed app or browser tab; the server
  accepts only those fixed labels and ids of existing sets and stories. A browser signed in to the admin
  area stops counting (`euskalduo.stats.exclude.v1`), so our own testing is
  left out; **Admin → Usage** has a switch to count it again. Counters wait in `localStorage` (`euskalduo.stats.pending.v1`)
  until the server has them, so offline practice is sent later with the
  device's date for that day (`"day"`; accepted up to 30 days back, otherwise
  counted today). The server adds them to one row of totals per day and one
  row per day and label (no IP, no id, capped per request), shown under
  **Admin → Usage** with weekly devices and the last 30 days per label. Browsing without
  practising sends nothing. Clearing browser data makes a device count as new
  again, so "devices" is an upper bound.
* **Feedback is the exception, and only on purpose.** When someone sends
  the *Comentarios* form, the server stores the message, the optional name
  and screenshot (re-encoded, metadata dropped), the current screen
  (`#/…`), window size, browser user agent and IP address. The IP is kept
  to spot abuse; for rate limiting it is also kept in the database for up to
  one hour. Progress and the name from *Ajustes* are never sent. The
  *Privacidad* page says this. Delete feedback once you have reviewed it.
* **Logging.** The nginx access log records only time, method, path, status
  and size: no IP address, user agent, query string or referrer. PHP-FPM
  access logs are disabled. The API never logs request bodies.
* **What this does not cover.** Any web server, reverse proxy, hosting
  provider or network in front of the app still processes visitors' IP
  addresses and may log them. Browser-only storage does **not** by itself
  remove GDPR obligations for whoever runs a public instance. Review your
  host and proxy logging and provide appropriate information to families.
* **Losing progress.** Progress lives in one browser on one device. Clearing
  site data, private windows or switching devices loses it. **Ajustes**
  offers *Descargar mi progreso* / *Cargar progreso* (a local JSON file) and
  *Borrar mi progreso*.

The app has a simple child/parent-facing privacy page (**Privacidad** in the
footer).

## Security notes

* Admin routes are protected server-side: a session is required for every
  `/api/admin/*` path, a per-session CSRF token is required for every change,
  and login requires a JSON body. Failed logins are throttled globally.
* The session cookie is `HttpOnly`, `SameSite=Strict`, and also `Secure` when
  the request arrives over HTTPS.
* No password or token is in the frontend bundle. The admin UI is a separate
  lazily loaded chunk.
* All imported/edited text is validated (UTF-8, NFC, lengths, no control
  characters, no `<` `>`) and rendered as text only.
* Feedback (`POST /api/public/feedback`, no login): at most 10 attempts per
  IP per hour, messages ≤ 5000 characters, screenshots go through the same
  image checks as pictures (scaled to ≤ 1600 px). The total size is capped
  (`FEEDBACK_MAX_MB`), so a flood cannot fill the disk. Behind a proxy the
  IP comes from `X-Forwarded-For`, trusted only from private networks.
  Without a proxy in front, someone who reaches the container from such a network could fake it
  and get around the per-IP limit; the size cap still holds.
* Uploads: type detected from content, only PNG/JPEG/WebP, size and dimension
  limits, re-encoded to WebP (drops EXIF/GPS), random file names, served with
  `nosniff` and a sandboxing CSP. SVG is not accepted.

## Before sharing with classmates over the internet

The default setup is for local testing (bound to `127.0.0.1`, plain HTTP).
Treat publishing to a class as a separate decision. Before doing it:

1. Serve it **only over HTTPS** (e.g. behind Traefik/Caddy with a
   certificate).
2. Set a **strong** `ADMIN_PASSWORD` (or hash). Consider restricting `/admin`
   to your own network at the proxy.
3. Review **host and proxy logging** (IP addresses, retention) and write a
   privacy notice that matches your actual setup.
4. Set up **backups** (below) and test a restore.
5. Check the published content: sample sets, translations and pictures
   (you must have the right to use every picture).
6. Get the agreement of the school/teacher and parents where appropriate.

## Collecting feedback

Feedback lives in the content volume under `/data/feedback`: one
`<id>.json` per message and `<id>.webp` for its screenshot. Ids are UUIDv7,
so file names sort by arrival time.

```sh
# How much is there?
docker compose exec api php bin/feedback.php stats

# Download everything into ./feedback-inbox/ (on a server: prefix with ssh)
mkdir -p feedback-inbox
docker compose exec -T api tar -C /data/feedback -cf - . | tar -xf - -C feedback-inbox
#   ssh server 'cd euskalduo && docker compose exec -T api tar -C /data/feedback -cf - .' | tar -xf - -C feedback-inbox

# After downloading, free the space: deletes everything up to and including
# the given id (use the "newest" id that `stats` printed before downloading,
# so anything that arrived in the meantime is kept).
docker compose exec api php bin/feedback.php purge-through <id>
```

When the box is full, learners see a message asking them to contact
`FEEDBACK_CONTACT` instead.

## Backups and resetting

All persistent state is in named volumes: `euskalduo_content` (SQLite
database, generated secret/credentials, feedback), `euskalduo_uploads`
(pictures), `euskalduo_audio` (speech and story clips), `euskalduo_speech-models`
(the voice model) and `euskalduo_speech-queue` (a text list the API
regenerates on every start — no need to back it up).

```sh
# Backup (briefly stops the API for a consistent SQLite copy)
docker compose stop api
docker run --rm -v euskalduo_content:/data:ro -v euskalduo_uploads:/uploads:ro \
  -v "$PWD":/backup alpine tar czf /backup/euskalduo-$(date +%F).tgz /data /uploads
docker compose start api

# Restore (overwrites the current content)
docker compose down
docker run --rm -v euskalduo_content:/data -v euskalduo_uploads:/uploads \
  -v "$PWD":/backup alpine sh -c 'cd / && tar xzf /backup/euskalduo-YYYY-MM-DD.tgz'
docker compose up -d
```

Audio can always be regenerated (`docker compose run --rm --no-deps tts once`);
include `euskalduo_audio` in the backup only to save that time.

**Reset to the demo state:** `docker compose down -v && docker compose up --build`.
This deletes **all** content, pictures, audio and the generated admin
password. A new password is printed, and the samples are loaded again.

## Upgrading to 0.2 (catalogue, lessons, listening)

The database moves to schema version 8 automatically on the first start of
the new API. The migration only adds columns and tables; it changes no
existing content: sets keep their ids, entries their ids and order, so
learners' progress keys stay valid. School "weeks" become sheets (their date
is kept as "received on"), and every set with an exam date becomes an exam of
that set with the same id. Nothing in browsers is cleared: learner progress
(version 1) is migrated in the browser when it is read, old progress files
can still be imported, old `#/semana…`/`#/mezclar` links redirect, offline
copies of the old catalogue are read as before, and counters queued offline
by the old version are still accepted.

```sh
# 1. Back up first (see above).
# 2. Build and start the new version (migrates on start):
docker compose up -d --build
docker compose logs api | tail -20        # "Seeded …", "Speech queue updated."
# 3. Speech: once per install, then the worker keeps up by itself.
docker compose run --rm tts setup         # downloads the pinned voice model
docker compose up -d tts
#    or a single pass now:  docker compose run --rm --no-deps tts once
# 4. Admin → Stories: review the starter stories, publish when audio is ready.
```

**Rollback:** stop the stack, restore the backup taken in step 1, check out
the previous version and start it:

```sh
docker compose down
# restore the tar backup into the volumes (see "Restore" above)
git checkout <previous tag or commit>
docker compose up -d --build
```

The old version also starts on an upgraded (v8) database, because it only
reads the columns it knows; but sets, stories and exams created after the
upgrade would then be invisible or behave like weeks without dates, so a
restore from the backup is the clean way back. Learner browsers that already
saved version 2 progress keep it; an older app would ignore that data
(it reads only version 1), so prefer not to roll back once children have
practised with the new version.

## Development and tests

```sh
# PHP tests (import validation, line parser, image safety, auth/CSRF, admin API flow, seeding)
docker compose --profile test run --rm api-test

# Frontend lint + typecheck + unit tests (answer checking, scheduler, round building, storage, privacy of the API client)
docker compose --profile test run --rm web-test

# End-to-end against the running stack (headless Chromium; learner round,
# reload persistence, lessons, topics, listening, sentences/grammar, exams,
# offline, network privacy check, admin import→picture→publish→edit)
cd web && npm ci
E2E_ADMIN_PASSWORD=... npx playwright test
# If a Chromium is already installed and the bundled one is missing:
#   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npx playwright test
```

Frontend dev server with hot reload (proxying `/api` to the running stack):
`cd web && npm run dev`.

### Technology choices

* **React 19 + TypeScript + Vite** for the client, with **react-router** (hash
  routing) and no UI framework. The stylesheet is hand-written CSS. Lessons
  use two bundled fonts (`web/src/fonts`, SIL Open Font License): Andika,
  designed for children learning to read, and Lilita One for signs and the
  word being asked; nothing is loaded from a font service. The rest of the app
  still uses the system font stack.
* **PHP 8.4 + Symfony 8** micro-kernel (`framework-bundle` only) with plain
  PDO/SQLite. A small API does not need an ORM, security bundle or
  serializer, so it stays easy to read.
* **GD** for image re-encoding, **intl** for Unicode normalisation.
* **nginx (unprivileged)** serves the static build and uploads and forwards
  `/api` to PHP-FPM.
* Tests: PHPUnit 12 (+ BrowserKit), Vitest, Playwright.

More detail: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (storage, endpoints,
browser-only state, the practice algorithm).

## Limitations and follow-ups

* Progress is per browser. There is no sync between devices except manual
  export/import.
* The starter stories, sentences and grammar items were written without a
  Basque speaker's review; they ship as drafts flagged for review.
* Voice clips require initial model setup and background generation. There
  is no pronunciation scoring. Only the typed-meaning exercise accepts
  accent-less answers ("almost"); Basque spelling must be exact.
* Stories have one narrator (the Maider voice) and multiple-choice questions
  only. Durations are checked after generation; a story that is too long or
  short must be edited and regenerated.
* Sentence and grammar answers are exactly the curated ones: a different but
  correct sentence is marked wrong unless it is listed as an alternative.
* The same word on two sheets keeps two separate progress records (it is
  only kept out of the same lesson twice); there is no shared word identity.
* The ordering exercise uses runs of up to 5 items from an ordered group, not
  the full 12-month sequence.
* Only Spanish UI strings exist today (`web/src/i18n/es.ts`). Russian or
  Basque UI needs a translated copy of that file.
* One admin account. There are no roles, audit log or content versioning.
  Deleting a set or story is permanent (the UI asks for confirmation).
* Emoji depend on the device's emoji font. Sample pictures are emoji only; no
  licensed image set is bundled.
* Learner content is fetched on every visit (with ETag revalidation); offline,
  the last saved copy is used. Offline mode needs one visit with a connection
  first, and browsers may still clear saved data when storage is very low.
