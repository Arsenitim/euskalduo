# Sample homework

Both files are ready to import (**Admin → Import → JSON → Load example** or
upload the file). On the very first start of an empty database they are also
loaded as published sample sheets, marked "Ejemplo" (without dates). They are never re-created once
deleted, and they never overwrite real content.

* `hiztegia-1-gaia.json` — the 26 entries of the handout headed
  `HIZTEGIA (1.Gaia)`, in sheet order (the two right-column entries come first).
  Spelling is kept as printed. Alternatives from the handout are separate list
  items (`Txapelketa` → `campeonato`, `concurso`). `receivedOn` is `null`
  because the sheet has no date.
* `hilabeteak-eta-astegunak.json` — the sheet `HILABETEAK ETA ASTEGUNAK`, with
  two ordered groups (12 months, 7 weekdays) in source order. The sheet has
  no translations; the Spanish ones here were added for admin review. The
  decorative flower drawing on the sheet is deliberately not used as a
  picture.
* `topics/` — the built-in topics (`"kind": "topic"`): `astegunak.json`
  (the 7 weekdays) and `hilabeteak.json` (the 12 months), each one ordered
  group; `hitz-motak.json` (word formation); `esaldiak.json` (8 sentence-building
  items) and `gramatika.json` (8 grammar gaps with *izan* forms and time
  words). They are added once per install (also on existing installs), never
  re-created once deleted. Topics whose entries are flagged for review
  (`esaldiak`, `gramatika`: written without a Basque speaker's check) stay
  drafts until an admin clears the flags and publishes them. Entry ids are
  stable.
* `weeks/` — real school sheets (the folder keeps its old name) with their
  `receivedOn` dates, published as they are (not "Ejemplo"). Each file is
  seeded once per install, also on existing installs, and never re-created
  once deleted, so adding a new sheet here and restarting is enough.
* `stories/` — six starter listening stories (four short, two extended), each
  with Spanish and Russian translations, questions and links to catalogue
  words. Seeded once per install **as drafts flagged for review**: they were
  written without a Basque speaker's check, and need generated audio before
  they can be published. Measured lengths with the Maider voice (2026-11-10):
  `triku-bizkar-zorroa` 23.2 s, `txapi-ordularia` 23.3 s, `baratzeko-tomatea`
  23.7 s, `legatza-igerilekuan` 25.9 s (short); `trikuren-astea` 52.6 s
  (extended, level 1), `eskulan-txapelketa` 67.6 s (extended, level 2).
  * `hiztegia-denborazkoak.json` — the sheet `HIZTEGIA (DENBORAZKOAK)`, 23
    time expressions, week of 2026-09-28. Reading order: left column top to
    bottom, then right column. Spelling kept as printed (`Aurten`).
* `homework.schema.json` — JSON Schema describing the import format.

Editorial additions made by the developer and worth a human check:

* All Russian (`ru`) glosses in both files.
* `emoji` and `imageHint` on a few clearly picturable handout words. They are
  illustrations only, not answers; most words (verbs, adjectives, abstract
  words, calendar words) have no picture and every exercise works without one.

- `weeks/2026-10-05-hitz-motak.json`: October 5, 2026 school materials:
  compounds and derived words, time vocabulary, pronouns, *izan*, and capitals.
- `topics/hitz-motak.json`: permanent word-formation practice, using the same
  word-building metadata. New category files also reach existing installations;
  edited or deleted categories are never recreated.
- `weeks/2026-11-02-lexikoa-denborazkoak.json`: the sheet `Lexikoa: Denborazkoak`
  (same 23 time expressions as `hiztegia-denborazkoak.json`) repeated for the
  week of 2026-11-02, with no exam date.
