# ChatGPT prompt: homework photo → EUSKALDUO JSON

Copy everything between the lines below into ChatGPT (or another assistant)
together with the photo(s) of the homework sheet. Paste the JSON it returns into
**Admin → Import → JSON**, check the review screen, assign the homework week,
and only then save and publish. This is a manual template; EUSKALDUO does not
call any AI service.

---

You are helping a parent prepare Basque (Euskara) vocabulary homework for a
children's practice app. Read the attached photo(s) of a school handout and
return **only** a JSON object in the format below — no explanations, no
Markdown code fences.

Rules:

1. Copy every Basque word or phrase **exactly as printed**: same spelling,
   capitalisation, hyphens (e.g. `Bizkar-zorroa`), spaces (e.g. `Aire girotua`)
   and suffixes such as `-a` / `-ia`. Do not correct, normalise or "improve"
   the Basque. Keep the order in which entries appear on the sheet; if the
   sheet has columns, say in `description` which reading order you used.
2. Spanish translations go in `translations.es` as a **list**. If the sheet
   gives several meanings (e.g. `campeonato, concurso`), put each one as a
   separate string: `["campeonato", "concurso"]`. Never return one string
   containing commas or slashes for alternatives.
3. If the sheet prints a translation, use it. If it does not, you may propose
   the usual Spanish meaning, but set `"needsReview": true` and explain in
   `reviewNote` that the translation was added by you.
4. **Never guess unclear text.** If a word is blurred, cut off, handwritten
   ambiguously or you are unsure of its meaning, still include your best
   reading, set `"needsReview": true`, and describe the problem in
   `reviewNote` (e.g. "second letter unreadable: Loreontzi or Laraontzi?").
5. Do not invent dates. Leave `"weekStart": null` — the parent assigns the
   week. Put the sheet's heading or theme (e.g. `HIZTEGIA (1.Gaia)`) in
   `title`.
6. If the sheet has headed sections with a natural order (months, weekdays,
   numbers), declare them in `groups` with `"ordered": true` and set `group` on
   each entry. Decorative drawings are not vocabulary pictures — ignore them.
7. `imageHint` (optional) is a short English description of a picture that
   would illustrate the word, only for concrete, picturable nouns. Leave it out
   for verbs, adjectives, abstract words and grammar forms. Never give URLs.
8. Russian (`translations.ru`) is optional; include it only if asked.
9. Output must be valid UTF-8 JSON that follows this shape exactly:

{
  "schemaVersion": 1,
  "title": "HIZTEGIA (1.Gaia)",
  "weekStart": null,
  "description": "Optional theme or notes about the sheet",
  "groups": [
    { "key": "hilabeteak", "title": "HILABETEAK", "ordered": true }
  ],
  "entries": [
    {
      "basque": "Txapelketa",
      "translations": { "es": ["campeonato", "concurso"] }
    },
    {
      "basque": "Zaborrontzia",
      "translations": { "es": ["cubo de la basura"] },
      "imageHint": "a rubbish bin"
    },
    {
      "basque": "urtarrila",
      "translations": { "es": ["enero"] },
      "group": "hilabeteak",
      "needsReview": true,
      "reviewNote": "Translation added by the assistant; not printed on the sheet."
    }
  ]
}

Omit `groups` when the sheet has no sections, and omit optional fields you do
not need. Return the JSON only.

---

The full field reference is in `docs/IMPORT_FORMAT.md` and
`samples/homework.schema.json`.
