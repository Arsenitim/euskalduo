# Architecture notes

```
browser ──HTTP──▶ web (nginx, :8080)
                   ├─ /            built React app (static files)
                   ├─ /uploads/    pictures, read-only volume
                   └─ /api/  ──FastCGI──▶ api (PHP 8.4-FPM + Symfony 8)
                                          ├─ /data/euskalduo.sqlite   (volume "content")
                                          └─ /uploads/*.webp          (volume "uploads")
```

Only `web` publishes a port. PHP-FPM listens only on the compose network.

## Content storage (server)

SQLite holds **homework content only**, plus a login-throttle counter and a
little metadata:

* `homework_sets` — id, title, week_start (ISO date or NULL), exam_date
  (ISO date or NULL: a school exam on this set, announced to learners),
  description, groups JSON, status (`draft`/`published`), sample flag,
  timestamps.
* `entries` — (set_id, id) primary key, position (explicit order), basque,
  translations JSON (`{"es": [...], "ru": [...]}`), note, group key, emoji,
  image hint, image file name, needs_review, review note.

Admin credentials come from environment variables, or a generated hash in
`/data/admin-credentials.json`. The API is a small Symfony micro-kernel with
plain PDO (no ORM) — see `api/src/Content`.

Endpoints:

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/public/content` | anyone | All published sets with entries, one response. No input, no cookies, no session. ETag for cheap revalidation. |
| `POST /api/public/feedback` | anyone | Learner feedback (multipart: `message`, optional `name`, `page`, `viewport`, `screenshot`). Stored as files, rate-limited per IP, total size capped. The only learner request with a body, sent only from the feedback form. |
| `POST /api/public/stats` | anyone | Anonymous usage counters (JSON: optional `day`, `newDevice`, `activeToday`, `answers`, `rounds`), added to one row of totals per day. `day` (device date, for counters queued offline) is used if within the last 30 days or tomorrow, otherwise today (UTC). No id, no IP; each counter capped at 500 per request. |
| `GET /api/admin/stats` | admin | Totals and the last 30 days for **Admin → Usage**. |
| `GET /api/health` | anyone | Health check. |
| `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/session` | admin | Session login (JSON body required). |
| `GET/POST /api/admin/sets`, `GET/PUT/DELETE /api/admin/sets/{id}` | admin | CRUD. The same validator runs for import and every save. |
| `POST /api/admin/sets/{id}/publish` / `unpublish` | admin | Publishing requires a week and no entries flagged for review. |
| `POST/DELETE /api/admin/sets/{id}/entries/{entryId}/image` | admin | Picture upload (re-encoded) / removal. |
| `POST /api/admin/import/validate` | admin | Parse JSON or quick lines; return a normalised draft, per-entry errors and warnings. Saves nothing. |

`AdminGuardSubscriber` protects every `/api/admin/*` path (even unknown ones)
before routing: a session is required, and state-changing requests need the
per-session `X-CSRF-Token`. The session cookie is `HttpOnly`,
`SameSite=Strict`, and `Secure` when served over HTTPS (directly or with
`X-Forwarded-Proto: https`). Failed logins are throttled globally (10 per
15 minutes) so no IP addresses need to be stored.

## Learner state (browser only)

Everything about a learner is in `localStorage` key `euskalduo.learner.v1`
(`web/src/learner/progress.ts`): optional display name, meaning language,
pinned "current week" (always a homework week, never a category), per-entry statistics keyed `"<setId>/<entryId>"`, and
per-set rounds/best stars. It is validated on load and on import; invalid
records are dropped individually. Export/import is a local JSON file download
and file read — nothing is uploaded.

The learner app fetches content with one API call (`fetchContent` in
`web/src/api/public.ts`) with `credentials: 'omit'` and no parameters; the
other learner requests are the anonymous counters (`stats.ts`), feedback
(`feedback.ts`), speech clips (`audio.ts`) and the offline download
(`offline.ts`). An ESLint rule forbids calling `fetch` anywhere else in
learner code. Learner
routes use the URL fragment (`#/semana/…`), which browsers never send to the
server, so even the chosen week does not reach server logs.

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
the catalogue plus every picture and clip it refers to, asks for persistent
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

`web/src/learner/scheduler.ts` and `web/src/learner/questions.ts`.

* **Boxes (Leitner).** Each word is in box 0–5. The first answer to a word in a
  round moves it up one box if right, back to box 0 if wrong or skipped
  ("No lo sé"), and leaves it where it is if it was spelled with the hint. A word in box *b*
  becomes due again after 0, 1, 2, 4, 7, 14 days. Missing days never moves a
  word down. Box ≥ 3 counts as "learned" in the progress view.
* **Selection weights.** Missed last time (box 0) 4 › never seen 3 › due
  2–3 (lower boxes higher) › not yet due 0.4. Words are drawn by weighted
  sampling without replacement; small sets repeat words with a different
  exercise type.
* **Round length.** 2 questions per word, min 3, max 10.
* **This week.** All word questions come from the chosen week, except at most
  2 (and ≤ 20 %) slots for *due, already practised* words from other weeks.
* **Mix.** Each selected week gets at least one word; remaining slots are
  weighted so every week gets an equal share regardless of size.
* **Exam.** A set with an `exam_date` today or later appears as a *Preparar
  el examen* section (home card + `#/examen/…` page) until the exam day.
  Its rounds draw only from that set and ignore the review calendar: every
  word keeps circulating, weakest first (wrong 4 › unseen 3 › box-weighted
  ≥ 1), so nothing on the sheet rests before the exam. Boxes and stars are
  recorded as usual.
* **Exercise types.** Basque → choose meaning; meaning (or picture) → choose
  Basque; spell with letter tiles (typed for terms > 14 letters); type the
  meaning (for words in box ≥ 2); order a run of up to 5 items from an ordered
  group (one per round, when the round has ≥ 6 questions). New words start with
  recognition; harder types appear as the box rises.
* **Distractors.** Prefer words from the same homework. Never offer another
  accepted gloss of the target, a word sharing any meaning with the target, or
  a word with the same Basque spelling; labels are unique ignoring
  case/accents. With too few candidates, multiple choice is skipped rather
  than showing an impossible question.
* **Answer checking.** Case and extra spaces are ignored; every configured
  alternative is accepted. For meanings, a leading Spanish article is optional
  and missing accents count as "almost" (accepted, correct spelling shown).
  Basque terms must match letter for letter (no morphological relaxation).
* **Retries.** A missed word comes back (max. 4 per round) three questions
  later with a different exercise type. Retries do not change boxes or stars.
* **Spelling help.** Spelling questions offer **💡 Pista** once: it fills in
  the first third of the letters (rounded up, never the whole word), which
  then cannot be erased. **No lo sé** skips the question; it counts as wrong,
  so the word comes back.
* **Stars.** Each question's first answer scores 1 point, ½ if the hint was
  used, 0 if wrong or skipped. Points / questions ≥ 90 % → 3 stars, ≥ 60 % → 2,
  otherwise 1. Finishing always earns at least one star.

## Pre-generated speech

A CPU-limited Python/Piper worker reads the public catalogue over the internal
Compose network and writes
content-addressed MP3s into an `audio` volume. PHP adds an optional nullable
`audio` URL to catalogue entries only for completed clips. nginx serves the
volume read-only at `/audio/`, without access logging. Synthesis never runs in
a web request. See [VOICE.md](VOICE.md) for setup, playback rules and credits.
