# EUSKALDUO

A small, playful web app that helps children practise **Basque (Euskara)
vocabulary from their real school homework**.

A parent imports the week's word list (for example, JSON prepared by ChatGPT
from a photo of the handout), checks it and publishes it. Kids then play short
rounds on a tablet, phone or computer. There are no accounts, ads or
leaderboards, and no pressure.

- **Five exercises:** choose the meaning, choose the Basque word, spell it
  with letter tiles, type the meaning, and put months/weekdays in order.
  Everything works without pictures.
- **Gentle feedback:** instant feedback with sounds, missed words come back
  later, and stars at the end of a round.
- **This week, any week, or a mix of earlier weeks.**
- **Private by design:** the server stores only homework content. Names,
  answers and progress stay in the child's browser.
- **Admin panel:** import, review, add pictures, publish.

The child-facing UI is in Spanish, and meanings can be shown in Spanish or
Russian.

## Run it

```sh
cp .env.example .env   # optional: set ADMIN_PASSWORD, port
docker compose up --build
```

Open <http://127.0.0.1:8765/> (learners) or <http://127.0.0.1:8765/admin/>
(user `admin`). If you set no password, it is printed once in
`docker compose logs api`. Two sample homework sets are loaded on first start.

## More

- [Full guide](docs/GUIDE.md): configuration, privacy, security, backups,
  tests, limitations
- [Import format](docs/IMPORT_FORMAT.md) and
  [ChatGPT import prompt](CHATGPT_IMPORT_INSTRUCTIONS.md)
- [Architecture and practice algorithm](docs/ARCHITECTURE.md)

Built with React + TypeScript + Vite, PHP 8.4 + Symfony 8 + SQLite, nginx and
Docker Compose.
