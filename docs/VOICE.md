# Basque speech (Maider + Piper)

The `tts` Compose worker generates static clips on this VM: for every word,
sentence and grammar item, and for every listening story. It has no listening
port, uses one CPU, reads which texts are needed (see "What gets audio"), and
writes audio into a separate volume. PHP and nginx only read that volume.
Synthesis never runs during a child's lesson.

## First setup and deployment

```sh
docker compose build tts
docker compose run --rm tts setup
docker compose up -d --build
```

Setup downloads only the pinned ONNX/config pair and verifies SHA-256 checksums.
The model volume persists across container rebuilds. Internet is needed for the
image build and initial download; normal generation runs locally.

The worker scans every 60 seconds. New and edited Basque text gets a new clip;
identical text across sets shares one file. Existing clips are reused after
restarts. Publishing a sheet or topic never waits for audio; publishing a
**story** does (it needs its recording). Reload the learner app after
generation to pick up new audio URLs. A missing or broken clip never blocks
practice.

## What gets audio

* The API writes `/speech/requests.json` (volume `speech-queue`, written only
  by the API, mounted read-only in the worker) whenever a set or story is
  created, saved or deleted, and on every API start. It lists every entry
  text and every story transcript, **drafts included**, so a story's audio is
  ready before it is published and its length can be checked.
* The worker also reads the public catalogue, as before. Either source alone
  is enough (a failing one is logged and retried).

## Durations, failures and stale audio

* Next to each clip `<key>.mp3` the worker writes `<key>.json` with
  `durationMs`, measured from the synthesised audio itself (frames ÷ sample
  rate), not estimated from word counts. Older clips without one get it
  measured with `ffprobe` on the next pass.
* Clips that fail are listed by key in `/audio/status.json` with time and
  error; the entry disappears once the clip succeeds. **Admin → Stories**
  shows each story's audio as *ready (duration)*, *pending* or *failed* with
  the error.
* A clip's name is a hash of the voice profile and the **exact** text. An
  edited transcript therefore has no clip until the worker makes one: the
  admin shows it as pending, the story cannot be published, and a published
  story whose text is edited is taken offline until then. An old clip can
  never be served for new text. A change to `tts/profile.json` (model,
  generator, settings) changes every key, so everything is regenerated.
* Story length limits (checked against the measured duration): short 15–50 s
  (target 20–40 s), extended 40–130 s (target 60–90 s; 45–60 s is fine for
  difficulty 1). Outside the limits a story cannot be published; outside the
  targets the admin sees a warning.

```sh
docker compose logs --tail=50 tts
docker compose run --rm --no-deps tts once
```

Avoid running `once` concurrently with the watch worker. If needed, stop only
`tts`, run the batch, then start `tts` again. Batch failures return a nonzero
exit status; the background worker retries catalogue errors next pass and clip
failures after five minutes. Logs show generated/reused/failed counts and clip
hashes. If a large phrase exhausts the 1 GiB limit, adjust the worker's memory
limit after measuring usage.

## Playback

Stories have their own player (see ARCHITECTURE.md, "Listening blocks"): the
learner starts the recording explicitly; it can be paused, continued and
replayed, word speech never plays during it, and with sound off it only plays
after *Escuchar igualmente*. A missing recording is reported calmly and the
lesson continues; it does not count as a mistake.

Word speech:

Visible Basque translation prompts are spoken on arrival. Exercises asking for
Basque stay silent until answered. After every answer, the existing feedback
sound plays, followed by the correct Basque (or the correct ordered sequence).
Lists, prompt cards, feedback and the missed-word summary offer replay buttons.
There is no automatic speech for lists, distractors, or unfinished word parts.

The existing sound preference controls voice and effects together. Muting stops
both immediately. Advancing, leaving the page, hiding the tab or requesting
replay cancels old playback. Browser autoplay restrictions fail quietly; use
replay if automatic speech is blocked. Missing clips omit their speaker button.

## Files and privacy

Output is mono MP3, 22.05 kHz, 64 kbps. Generation uses the model's default speed
and Piper's normalized output. Clip names hash the exact stored UTF-8 text and
the SHA-256 of `tts/profile.json`, joined with a NUL byte. Both PHP and Python
use that contract. Changes to the model, generator or settings must update the
profile. Old files are retained so open sessions remain usable.

`Entry.audio` and `Story.audio` (with `durationMs`) are URLs in the public
catalogue. `status.json` and the duration files are not served by nginx
(only `/audio/<64 hex>.mp3` is). Audio requests omit
credentials and referrers, never contain learner state, and cache up to eight
clips in memory. nginx does not log speech requests or missing speech files.
Existing MP3s receive immutable cache headers; missing files are not cached.
Any external reverse proxy should also exclude `/audio/` from access logging.

Include the audio and speech-models volumes in backups if avoiding regeneration
or downloads matters. No automatic pruning is performed in this version.

## Model and credits

Voice: Maider, Basque, one female speaker. Piper conversion by itzune:
https://huggingface.co/itzune/maider-tts

The learner footer includes a small “Voz: Maider” link to this model card.

Original voice/model: HiTZ Basque Center for Language Technology / Aholab,
University of the Basque Country EHU, funded by Project ILENIA:
https://huggingface.co/HiTZ/TTS-eu_maider

The cards identify Apache-2.0 for the model and CC BY 4.0 for the Basque voice
resource. Generated speech is synthesized from this voice. Piper is a separate
GPL-3.0-or-later dependency: https://github.com/OHF-Voice/piper1-gpl
Retain these notices when distributing the worker/model assets.

## Checks

```sh
python3 -m unittest discover -s tts
# Existing frontend/PHP test commands are in GUIDE.md.
```

Before using a different model/profile, render real vocabulary and phrases,
listen to pronunciation, and measure time and memory under the worker limits.

### N100 smoke test (2026-10-07)

The pinned model/config pair loaded successfully with Piper 1.8.0 on this VM.
Under a one-CPU/1 GiB container limit, model load took approximately 7 seconds;
seven words/phrases took 1.7–6.8 seconds each to synthesize and encode. Peak
Python process RSS was approximately 189 MiB. MP3s were 7–17 KB and 0.9–2.0
seconds long. Other verification jobs ran concurrently, so these are indicative
measurements, not a throughput guarantee. Pronunciation has not been reviewed
by a Basque speaker.

The worker never mounts SQLite: a WAL-mode database can need writable journal
metadata even for a read-only connection. It reads the public catalogue and
the API-written text list instead, which also keeps it independent of the
database schema. Drafts are in that list so stories can be checked before
publishing. A draft's clip is served by nginx like any other, but its name is a
hash of the exact text, so only someone who already knows that text can
request it; it is not listed anywhere public until the story is published.

Basque learner labels and Spanish translations use sentence case independently
of the stored text. For example,
`ARRATSALDEAN` is shown as `Arratsaldean` while its existing audio URL remains
unchanged. Replay labels follow the displayed spelling. See IMPORT_FORMAT.md
for capitalization rules and proper names.
