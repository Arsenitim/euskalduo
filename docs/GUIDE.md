# EUSKALDUO — full guide

A playful web app for practising Basque (Euskara) vocabulary from real school
homework. A parent (the admin) imports each week's word list, checks it and
publishes it. Children practise in short rounds on a tablet, phone or computer,
with no accounts, ads, leaderboards or streak penalties.

* **Learners:** "Esta semana", "Elegir semana", "Mezclar semanas"; five
  exercise types (choose the meaning, choose the Basque word, spell with letter
  tiles, type the meaning, put months/weekdays in order); immediate feedback;
  missed words come back later; stars at the end of a round; progress per week;
  short synthesised sound effects for right/wrong answers (mute with 🔊 or in
  Ajustes).
  The child-facing UI is simple Spanish; meanings can be shown in Spanish or
  Russian.
* **Admin:** log in, paste/upload JSON (or quick `Basque — Spanish` lines),
  review with per-entry errors and warnings, assign the week, add pictures,
  preview, publish/unpublish, edit and delete.
* **Privacy:** the server stores only homework content. Names, answers and
  progress stay in the child's browser.

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

On first start, two published **sample** sets are loaded (badge "Ejemplo").
They come from the fixtures in `samples/` and have illustrative dates. Delete
them in the admin whenever you like; they are never re-created.

### First steps as admin

1. Photograph the homework sheet. Give the photo to ChatGPT with the prompt in
   [`CHATGPT_IMPORT_INSTRUCTIONS.md`](../CHATGPT_IMPORT_INSTRUCTIONS.md).
2. **Admin → Import**: paste the JSON (or upload the `.json` file). To try
   it out, press **Load example**.
3. **Check & review**: fix errors, look at the warnings, set the **homework
   week**, and clear any "Needs review" flags. Then **Save as draft**.
4. Optional: upload a picture for concrete words (PNG/JPEG/WebP ≤ 5 MB).
5. **Preview**, then **Publish**. Learners see only published sets. The
   newest week is the default "Esta semana".

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

## Import format

The canonical format is versioned JSON (`schemaVersion: 1`). It is documented
in [`docs/IMPORT_FORMAT.md`](IMPORT_FORMAT.md) and
[`samples/homework.schema.json`](../samples/homework.schema.json). Key points:

* `translations.es` is a **list**. Each alternative (e.g. `campeonato`,
  `concurso`) is accepted on its own; commas are never split silently.
* `weekStart` may be `null` in an import; the admin assigns it before
  publishing. The homework week is independent of what the words mean.
* Optional `groups` with `ordered: true` (months, weekdays) keep the source
  order and enable the ordering exercise.
* `needsReview` marks unclear items; flagged sets cannot be published.
* `imageHint` is an editorial suggestion only, never shown to learners and
  never a URL.

## Privacy

* **No learner data on the server.** There are no learner accounts. Names,
  answers, scores and progress are stored in the browser's `localStorage`
  only. The learner app makes one request, `GET /api/public/content`, with no
  parameters, no body and no cookies. It downloads all published homework, so
  the server does not even learn which week a child opens. Learner pages use
  `#` URLs, which browsers do not send to the server.
* **No third parties.** No analytics, ads, trackers, external fonts, CDNs or
  external images. A Content-Security-Policy restricts everything to the same
  origin.
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

## Backups and resetting

All persistent state is in two named volumes: `euskalduo_content` (SQLite
database, generated secret/credentials) and `euskalduo_uploads` (pictures).

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

**Reset to the demo state:** `docker compose down -v && docker compose up --build`.
This deletes **all** content, pictures and the generated admin password. A
new password is printed, and the samples are loaded again.

## Development and tests

```sh
# PHP tests (import validation, line parser, image safety, auth/CSRF, admin API flow, seeding)
docker compose --profile test run --rm api-test

# Frontend lint + typecheck + unit tests (answer checking, scheduler, round building, storage, privacy of the API client)
docker compose --profile test run --rm web-test

# End-to-end against the running stack (headless Chromium; learner round,
# reload persistence, mix mode, network privacy check, admin import→picture→publish→edit)
cd web && npm ci
E2E_ADMIN_PASSWORD=... npx playwright test
# If a Chromium is already installed and the bundled one is missing:
#   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npx playwright test
```

Frontend dev server with hot reload (proxying `/api` to the running stack):
`cd web && npm run dev`.

### Technology choices

* **React 19 + TypeScript + Vite** for the client, with **react-router** (hash
  routing) and no UI framework. The stylesheet is hand-written CSS with the
  system font stack.
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
* No spoken audio or pronunciation (only synthesised effect sounds). Only the typed-meaning exercise accepts
  accent-less answers ("almost"); Basque spelling must be exact.
* The ordering exercise uses runs of up to 5 items from an ordered group, not
  the full 12-month sequence.
* Only Spanish UI strings exist today (`web/src/i18n/es.ts`). Russian or
  Basque UI needs a translated copy of that file.
* One admin account. There are no roles, audit log or content versioning.
  Deleting a set is permanent (the UI asks for confirmation).
* Emoji depend on the device's emoji font. Sample pictures are emoji only; no
  licensed image set is bundled.
* Learner content is fetched on every visit (with ETag revalidation). There is
  no offline/PWA mode.
