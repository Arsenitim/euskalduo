# Import formats (schemaVersion 2)

JSON is the canonical, reliable format. The server validators
(`api/src/Content/ImportValidator.php` for sheets and topics,
`api/src/Content/StoryValidator.php` for stories) are authoritative;
`samples/homework.schema.json` documents the set format as a JSON Schema.

There are two kinds of documents: **sets** (a school sheet or a topic, with
words, sentences and grammar items) and **stories** (listening comprehension,
`"type": "story"`, see below). **Admin → Import** recognises both.

## Sets: sheets and topics

```json
{
  "schemaVersion": 2,
  "kind": "sheet",
  "title": "HIZTEGIA (1.Gaia)",
  "receivedOn": null,
  "description": "Optional theme",
  "groups": [{ "key": "astegunak", "title": "ASTEGUNAK", "ordered": true }],
  "entries": [
    {
      "id": "optional-stable-id",
      "basque": "Txapelketa",
      "translations": { "es": ["campeonato", "concurso"], "ru": ["чемпионат"] },
      "note": "Optional context shown in the word list",
      "imageHint": "Editorial picture suggestion (admin only)",
      "emoji": "🏆",
      "group": "astegunak",
      "needsReview": false,
      "reviewNote": null
    },
    {
      "type": "sentence",
      "basque": "Gaur astelehena da.",
      "translations": { "es": ["Hoy es lunes."] },
      "sentence": {
        "tiles": ["gaur", "astelehena", "da", "."],
        "alternatives": [["astelehena", "da", "gaur", "."]],
        "distractors": ["naiz"]
      }
    },
    {
      "type": "grammar",
      "basque": "Ni ikaslea naiz.",
      "translations": { "es": ["Yo soy alumno."] },
      "grammar": { "text": "Ni ikaslea ___.", "answers": ["naiz"], "distractors": ["da", "gara"] },
      "note": "ni → naiz"
    }
  ]
}
```

| Field | Rules |
| --- | --- |
| `schemaVersion` | `2` (current) or `1` (older files, still accepted, see "Older files"). |
| `type` | Optional, `"set"`. A document with `"type": "story"` is a story. |
| `kind` | `"sheet"` (default): material from school. `"topic"`: a category (months, weekdays, sentences…). Both are part of the same catalogue: every published set is available to "Empezar" lessons, and to topic practice under **Temas**. The kind only decides under which heading a set is listed. |
| `title` | Required, ≤ 120 characters. Keep the sheet's heading, e.g. `1.Gaia`. |
| `receivedOn` | Optional `YYYY-MM-DD` or `null`: when the sheet arrived. Shown only as information ("Hoja recibida el…") — dates never decide availability, priority, default selection or relevance, and publishing needs no date. Ignored (with a warning) on topics. |
| `description` | Optional, ≤ 500. |
| `groups` | Optional sections. `ordered: true` = meaningful sequence (months, weekdays) → shown as numbered lists and used by the ordering exercise. |
| `entries[]` | 1–300, stored in the given order. |
| `id` | Optional, `[a-z0-9][a-z0-9_-]{0,39}`, unique within the set. Generated if missing. Learner progress is keyed by set id + entry id, so ids survive edits. |
| `type` | `"word"` (default), `"sentence"` or `"grammar"`. |
| `basque` | Required: ≤ 80 for words, ≤ 160 for sentences and grammar (the complete correct sentence). Stored exactly (after Unicode NFC and whitespace trimming). |
| `translations.es` | Required list of 1–8 alternatives; each alternative is accepted separately. A single string is accepted but produces a warning if it contains `,` `;` or `/`. For sentences: the meaning of the sentence. |
| `translations.ru` | Optional list, same rules. Other languages are rejected. |
| `sentence` | Only for `type: "sentence"`. `tiles`: 2–12 curated pieces in the correct order; **repeats are allowed** (identical tiles are interchangeable when checking); punctuation may be its own tile; joined with spaces they must spell `basque` (case and spaces before punctuation are ignored). `alternatives`: other accepted orders, each using exactly the same tiles — nothing is inferred, an order is right only if it is listed. `distractors`: up to 4 extra tiles that do not belong; they must not be one of the tiles, and should not make another correct sentence (prefer wrong verb forms). Write tiles in lower case unless they are names, so capitals do not give away the first tile. |
| `grammar` | Only for `type: "grammar"`. `text`: the sentence with exactly one gap written `___`. `answers`: 1–4 accepted fillers (any of them is right; one is shown among the options). `distractors`: 1–5 curated wrong options, different from every answer. `text` with `answers[0]` filled in must equal `basque`. No grammar is inferred from suffixes or word matching. |
| `note` | Optional, ≤ 300, shown to learners in the word list and after a grammar answer. |
| `imageHint` | Optional, ≤ 200. Editorial only: never displayed to learners and never a URL. Upload a real picture in the editor. |
| `emoji` | Optional, ≤ 8 characters, no letters/digits/spaces. Rendered with the device's emoji font. |
| `group` | Optional key of a declared group. |
| `formation` | Optional, words only (see "Word formation"). |
| `needsReview` / `reviewNote` | Flag for unclear items. A set with flagged entries cannot be published. |

### Older files (schemaVersion 1)

Files from the homework-week era keep working:

* `"kind": "week"` (or no kind) becomes `"sheet"`.
* `"weekStart"` becomes `receivedOn` (information only).
* `"examDate"` on a set is ignored with a warning: exams are now a separate
  selection under **Admin → Exams**. (Exam dates already stored on sets were
  turned into exams by the v8 database migration.)

### Exams

Not part of the import: **Admin → Exams** creates an exam from a title, an
optional date and a selection of sheets and topics. Learners get a
*Preparar el examen* section (until the date, if there is one) whose rounds
cover every item of those sets. The same material stays in ordinary lessons.

## Stories (listening)

```json
{
  "schemaVersion": 2,
  "type": "story",
  "id": "triku-bizkar-zorroa",
  "title": "Triku eta ogitartekoa",
  "format": "short",
  "difficulty": 1,
  "transcript": "Gaur astelehena da. Triku goizean eskolara doa. …",
  "translations": { "es": "Hoy es lunes. …", "ru": "Сегодня понедельник. …" },
  "questions": [
    {
      "id": "q1",
      "prompt": { "es": "¿Qué ha olvidado Triku?", "ru": "Что забыл Трику?" },
      "options": [
        { "es": "El bocadillo", "ru": "Бутерброд" },
        { "es": "La mochila", "ru": "Рюкзак" }
      ],
      "correct": 0
    }
  ],
  "links": { "words": ["Gaur", "Bizkar-zorroa"], "topics": ["eskola"], "sets": [], "entries": [] },
  "needsReview": true,
  "reviewNote": "Not yet checked by a Basque speaker."
}
```

| Field | Rules |
| --- | --- |
| `id` | Optional stable id (`[a-z0-9][a-z0-9_-]{0,39}`); generated if missing. Listening progress is kept per story id. |
| `title` | Required, ≤ 120. |
| `format` | `"short"`: 1–2 questions, used inside "Empezar" lessons (target audio 20–40 s; publishable 15–50 s). `"extended"`: 3–5 questions, in the **Escuchar** section (target 60–90 s, 45–60 s for difficulty 1; publishable 40–130 s). |
| `difficulty` | `1` easy, `2` medium, `3` harder. Learners start at 1 and are offered harder stories after understanding easier ones. |
| `transcript` | Required Basque text, ≤ 2000. One narrator (the Maider voice) reads exactly this text. Rendered as plain text. |
| `translations` | `es` and `ru`, both required. |
| `questions[]` | Multiple choice in the learner's meaning language. `prompt` and every option need `es` and `ru`; 2–4 options, unique per language; `correct` is the index of the right option. Ask about the overall meaning or clearly stated details, not spelling or long lists to remember. |
| `links` | `words`: Basque words the story uses, matched by exact spelling against the catalogue to judge whether a learner knows enough of them (the importer lists words the catalogue does not have). `entries`: explicit `"setId/entryId"` links (must exist to publish). `sets`: related sets. `topics`: free tags for constructions or themes. Links never merge progress and a story result never changes word progress. |
| `needsReview` / `reviewNote` | A flagged story cannot be published. |

A story can be **published** only when it is not flagged, its links are
valid, and the speech worker has produced audio for exactly the current
transcript with a measured duration inside the format's range (see
[VOICE.md](VOICE.md)). Editing the transcript of a published story takes it
offline until the new audio exists.

Learner-facing Basque entries and Spanish translations use sentence case
(`GAUR` → `Gaur`,
`gu` → `Gu`, `JOAN DEN ASTEAN` → `Joan den astean`;
`frontón` → `Frontón`, `la semana pasada` → `La semana pasada`). This applies to lists,
questions, choices, spelling targets/hints, feedback, review and replay labels.
Stored/imported text and the admin editor retain the source capitalization;
audio URLs still refer to the original text, so this presentation change does
not regenerate speech. Existing internal capitals in mixed-case text are
preserved for names (`gaur Bilbon` → `Gaur Bilbon`). Uppercase words are lowercased
before the label’s first letter is capitalized; enter proper names with
intentional mixed case if their capitalization must be preserved. Formation
pieces/suffixes remain fragments in their original case. Each Spanish translation
alternative is formatted separately; Russian translations retain their source
case. Answer checking continues to ignore capitalization.

Text rules for every field: valid UTF-8; normalised to NFC; whitespace
collapsed; control characters, bidi overrides and `<` `>` are rejected. Unknown
fields are ignored with a warning. Duplicate Basque terms, repeated
alternatives, and the same Spanish meaning on two entries are reported as
warnings (the games already avoid offering two correct answers).

## Quick lines

For small lists, **Import → Quick lines** accepts one entry per line:

```
Zaborrontzia — cubo de la basura
Txapelketa – campeonato; concurso
Lantegi - taller, fábrica
Aire girotua<TAB>aire acondicionado
# lines starting with # are ignored
```

The separator is an em/en dash, a tab, `=`, or a hyphen **with spaces around
it** (so `Bizkar-zorroa` keeps its hyphen). On the right side, `;` `,` and `/`
separate alternatives. Lines produce word entries without a title; fill it in
on the review screen.

## Images

PNG, JPEG or WebP, max 5 MB and 8000 px per side. The type is detected from
the file contents; SVG, GIF, HTML and anything else is rejected. Every image is
decoded and re-encoded to WebP (max 800 px), which strips metadata such as
camera GPS data. Files are stored under random names in the `uploads` volume
and served only by nginx from `/uploads/<32 hex>.webp`.

### Word formation (optional)

An entry can add `formation: { "kind": "compound", "parts": ["lore", "ontzi"] }`
or `formation: { "kind": "derived", "parts": ["margo", "-lari"] }`.
There must be exactly two nonempty parts; a derived suffix starts with `-`.
These are curated word/stem and word/suffix pairs, not automatically inferred
letter splits. `basque` remains the complete correct spelling. Use `note` to
explain article endings and spelling changes, for example
`zabor + ontzi → zaborrontzi` or `ordu + -tegi → ordutegia` (with article `-a`).

When suitable parts exist, topic or sheet practice includes one compound and
one derived-word activity, and "Empezar" lessons include one now and then.
Children choose the missing second piece from parts of the same type, then
see the complete construction and explanation. Existing feedback, retry,
score and local progress apply. The admin editor can add or edit the parts.
The permanent **Formación de palabras · Hitz motak** topic uses the same
activity.
