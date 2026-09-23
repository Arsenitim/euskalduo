# Sample homework

Both files are ready to import (**Admin → Import → JSON → Load example** or
upload the file). On the very first start of an empty database they are also
loaded as published sample sets, marked "Ejemplo" and given illustrative week
dates (the current and the previous Monday). They are never re-created once
deleted, and they never overwrite real content.

* `hiztegia-1-gaia.json` — the 26 entries of the handout headed
  `HIZTEGIA (1.Gaia)`, in sheet order (the two right-column entries come first).
  Spelling is kept as printed. Alternatives from the handout are separate list
  items (`Txapelketa` → `campeonato`, `concurso`). `weekStart` is `null`
  because the sheet has no date.
* `hilabeteak-eta-astegunak.json` — the sheet `HILABETEAK ETA ASTEGUNAK`, with
  two ordered groups (12 months, 7 weekdays) in source order. The sheet has
  no translations; the Spanish ones here were added for admin review. The
  decorative flower drawing on the sheet is deliberately not used as a
  picture.
* `homework.schema.json` — JSON Schema describing the import format.

Editorial additions made by the developer and worth a human check:

* All Russian (`ru`) glosses in both files.
* `emoji` and `imageHint` on a few clearly picturable handout words. They are
  illustrations only, not answers; most words (verbs, adjectives, abstract
  words, calendar words) have no picture and every exercise works without one.
