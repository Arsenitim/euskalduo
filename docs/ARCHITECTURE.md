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

* `homework_sets` — id, title, week_start (ISO date or NULL), description,
  groups JSON, status (`draft`/`published`), sample flag, timestamps.
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
pinned "current week", per-entry statistics keyed `"<setId>/<entryId>"`, and
per-set rounds/best stars. It is validated on load and on import; invalid
records are dropped individually. Export/import is a local JSON file download
and file read — nothing is uploaded.

The learner app makes exactly one API call (`fetchContent` in
`web/src/api/public.ts`) with `credentials: 'omit'` and no parameters. An
ESLint rule forbids calling `fetch` anywhere else in learner code. Learner
routes use the URL fragment (`#/semana/…`), which browsers never send to the
server, so even the chosen week does not reach server logs.

## Practice logic

`web/src/learner/scheduler.ts` and `web/src/learner/questions.ts`.

* **Boxes (Leitner).** Each word is in box 0–5. The first answer to a word in a
  round moves it up one box if right, back to box 0 if wrong. A word in box *b*
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
* **Stars.** First-try accuracy ≥ 90 % → 3, ≥ 60 % → 2, otherwise 1. Finishing
  always earns at least one star.
