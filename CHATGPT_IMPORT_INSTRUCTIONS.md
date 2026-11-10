# ChatGPT prompt: homework photo → EUSKALDUO JSON

Copy everything between the lines below into ChatGPT (or another assistant)
together with the photo(s) of the homework sheet. Paste the JSON it returns into
**Admin → Import → JSON**, check the review screen, and only then save and
publish. No date is needed. This is a manual template; EUSKALDUO does not
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
5. Do not invent dates. Leave `"receivedOn": null`. Put the sheet's heading
   or theme (e.g. `HIZTEGIA (1.Gaia)`) in `title`.
6. If the sheet has headed sections with a natural order (months, weekdays,
   numbers), declare them in `groups` with `"ordered": true` and set `group` on
   each entry. Decorative drawings are not vocabulary pictures — ignore them.
7. `imageHint` (optional) is a short English description of a picture that
   would illustrate the word, only for concrete, picturable nouns. Leave it out
   for verbs, adjectives, abstract words and grammar forms. Never give URLs.
8. Russian (`translations.ru`) is optional; include it only if asked.
9. Output must be valid UTF-8 JSON that follows this shape exactly:

{
  "schemaVersion": 2,
  "kind": "sheet",
  "title": "HIZTEGIA (1.Gaia)",
  "receivedOn": null,
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

For word-formation worksheets, optionally add `formation` to a vocabulary entry:
`{"kind":"compound","parts":["lore","ontzi"]}` or
`{"kind":"derived","parts":["margo","-lari"]}`. Use exactly two curated
word/stem and word/suffix parts, keeping `basque` as the final correct spelling.
A suffix starts with `-`. Explain article endings or spelling changes in
`note`; do not invent decompositions when unsure. Ordinary vocabulary needs
no formation metadata.

### Sentences and grammar (optional)

If the sheet has sentence exercises, an entry can be
`"type": "sentence"` with the complete sentence in `basque` and
`"sentence": {"tiles": [...], "alternatives": [[...]], "distractors": [...]}`:
tiles in the correct order (lower case unless names; punctuation may be its
own tile; repeats allowed), every other correct order listed explicitly, and
optional wrong extra tiles that cannot form another correct sentence. A gap
exercise is `"type": "grammar"` with `"grammar": {"text": "Ni ikaslea ___.",
"answers": ["naiz"], "distractors": ["da", "gara"]}`. Copy what the sheet
shows; mark anything you composed yourself with `needsReview`.

## Second prompt: a listening story

EUSKALDUO does not generate stories itself. To draft one with an assistant,
ask for **only** JSON in this shape (see `docs/IMPORT_FORMAT.md`, "Stories"):

```
{"schemaVersion": 2, "type": "story", "id": "short-id", "title": "…",
 "format": "short", "difficulty": 1,
 "transcript": "Basque text, one narrator, short sentences",
 "translations": {"es": "…", "ru": "…"},
 "questions": [{"id": "q1", "prompt": {"es": "…", "ru": "…"},
   "options": [{"es": "…", "ru": "…"}, {"es": "…", "ru": "…"}], "correct": 0}],
 "links": {"words": ["Basque words from our sheets that the story uses"], "topics": ["eskola"]},
 "needsReview": true, "reviewNote": "Draft by an assistant; check the Basque."}
```

Ask for: a funny, simple situation for children aged 8–11 (school, animals,
harmless misunderstandings; Triku the hedgehog and Txapi the sheep may
appear), mostly words from the sheets you paste, few new words and none that
a question depends on, short sentences, no wordplay. *short*: about 50 words
(≈ 25 s of audio), 1–2 questions; *extended*: 110–150 words (≈ 55–70 s),
3–5 questions. Questions ask about the overall meaning or clearly stated
facts. Always keep `needsReview: true`: a Basque speaker should check the
text before you publish, and the app checks the real audio length.
