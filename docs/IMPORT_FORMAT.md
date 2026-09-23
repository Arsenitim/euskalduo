# Import format (schemaVersion 1)

JSON is the canonical, reliable format. The server validator
(`api/src/Content/ImportValidator.php`) is authoritative;
`samples/homework.schema.json` documents the same rules as a JSON Schema.

```json
{
  "schemaVersion": 1,
  "title": "HIZTEGIA (1.Gaia)",
  "weekStart": null,
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
    }
  ]
}
```

| Field | Rules |
| --- | --- |
| `schemaVersion` | Must be `1` for imports. |
| `title` | Required, ≤ 120 characters. Keep the sheet's heading, e.g. `1.Gaia`. |
| `weekStart` | `YYYY-MM-DD` or `null`. The admin assigns it during review; required to publish. Non-Mondays are allowed with a warning. The week is **independent of the content** (a word meaning "Monday" says nothing about the homework week). |
| `description` | Optional, ≤ 500. |
| `groups` | Optional sections. `ordered: true` = meaningful sequence (months, weekdays) → shown as numbered lists and used by the ordering exercise. |
| `entries[]` | 1–300, stored in the given order. |
| `id` | Optional, `[a-z0-9][a-z0-9_-]{0,39}`, unique within the set. Generated if missing. Learner progress is keyed by set id + entry id, so ids survive edits. |
| `basque` | Required, ≤ 80. Stored exactly (after Unicode NFC and whitespace trimming). |
| `translations.es` | Required list of 1–8 alternatives; each alternative is accepted separately. A single string is accepted but produces a warning if it contains `,` `;` or `/`. |
| `translations.ru` | Optional list, same rules. Other languages are rejected. |
| `note` | Optional, ≤ 300, shown to learners in the word list. |
| `imageHint` | Optional, ≤ 200. Editorial only: never displayed to learners and never a URL. Upload a real picture in the editor. |
| `emoji` | Optional, ≤ 8 characters, no letters/digits/spaces. Rendered with the device's emoji font. |
| `group` | Optional key of a declared group. |
| `needsReview` / `reviewNote` | Flag for unclear items. A set with flagged entries cannot be published. |

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
separate alternatives. Lines produce entries without title or week; fill them
in on the review screen.

## Images

PNG, JPEG or WebP, max 5 MB and 8000 px per side. The type is detected from
the file contents; SVG, GIF, HTML and anything else is rejected. Every image is
decoded and re-encoded to WebP (max 800 px), which strips metadata such as
camera GPS data. Files are stored under random names in the `uploads` volume
and served only by nginx from `/uploads/<32 hex>.webp`.
