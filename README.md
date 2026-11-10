# EUSKALDUO

A small, playful web app that helps children practise **Basque (Euskara)
from their real school materials**.

A parent imports each sheet when it arrives (for example, JSON prepared by
ChatGPT from a photo of the handout), checks it and publishes it. Kids press
**Empezar** and get a short lesson chosen for them from everything published —
no weeks, dates or menus first. There are no accounts, ads or leaderboards,
and no pressure.

- **Exercises:** choose the meaning, choose the Basque word, spell it with
  letter tiles, type the meaning, put months/weekdays in order, build words
  from words or suffixes, build sentences from tiles, fill grammar gaps, and
  listen to short Basque stories and answer questions. Everything except
  listening works without sound, and everything works without pictures.
- **Adaptive lessons:** spaced repetition favours mistakes and due words,
  brings in new words gradually, keeps big sheets from taking over, and mixes
  exercise types. Topics and single sheets can also be practised on their own.
- **Listening:** short stories inside lessons, longer ones in their own
  section, with replay, an optional transcript and translation, and Spanish
  or Russian questions.
- **Gentle feedback:** instant feedback with sounds and Basque voice, missed items come back
  later, and stars at the end of a round. Now and then a mascot (a hedgehog or
  a sheep in a txapela) cheers or sulks along.
- **Feedback button:** learners can send a message and a screenshot;
  you collect them as files (no e-mail, no chat).
- **Private by design:** the server stores only learning content, anonymous
  anonymous usage totals (no ids) and feedback people choose to send. Names,
  answers and progress stay in the child's browser.
- **Admin panel:** import, review, add pictures, publish; stories with audio
  status; exams.

The child-facing UI is in Spanish, and meanings can be shown in Spanish or
Russian.

## Run it

```sh
cp .env.example .env   # optional: set ADMIN_PASSWORD, port
docker compose up --build
```

Open <http://127.0.0.1:8765/> (learners) or <http://127.0.0.1:8765/admin/>
(user `admin`). If you set no password, it is printed once in
`docker compose logs api`. Sample sheets and topics are loaded on first start;
starter stories wait as drafts for review. For Basque speech run
`docker compose run --rm tts setup` once (see [VOICE.md](docs/VOICE.md)).
Upgrading from 0.1: see "Upgrading to 0.2" in the [guide](docs/GUIDE.md).

## More

- [Full guide](docs/GUIDE.md): configuration, privacy, security, backups,
  tests, limitations
- [Import format](docs/IMPORT_FORMAT.md) and
  [ChatGPT import prompt](CHATGPT_IMPORT_INSTRUCTIONS.md)
- [Architecture and practice algorithm](docs/ARCHITECTURE.md)

Built with React + TypeScript + Vite, PHP 8.4 + Symfony 8 + SQLite, nginx and
Docker Compose.

## License

[MIT](LICENSE)

Basque speech setup and model credits: [docs/VOICE.md](docs/VOICE.md).
