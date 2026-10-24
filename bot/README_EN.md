# DSHREMBOT Local Preview

This is a **self-hosted read-only bot**. It replies to its owner with `/status` for the machine on which it runs: uptime, load and free disk space. It has no access to the operator DSHREMBOT, Tvijo API, model router, shell, SSH, agent swarm or paid billing. For a customer Tvijo connection, [request a pilot](https://tvijo.com/static/dshrem-platform-en-20261018.html).

You need Node.js 22+ and a new Telegram bot from [@BotFather](https://t.me/BotFather). The token remains on **your** server.

```sh
cd bot
cp .env.example .env
chmod 600 .env
```

Edit `.env` locally and put the BotFather token in `DSHREM_BOT_TOKEN`. Do not paste it into a shell command, chat, issue or Tvijo form. Leave `DSHREM_BOT_OWNER_ID` empty for now, then run:

```sh
npm run pair
```

Within five minutes send `/id` to your new bot in a private chat. It replies with your numeric Telegram ID and exits. Put that ID in `DSHREM_BOT_OWNER_ID` in `.env`, then run:

```sh
npm start
```

Send `/start`, `/help` and `/status` in the private chat. The bot ignores messages from everyone else and from groups. If you get `telegram_http_409`, check that the same BotFather token is not used by another polling or webhook process; do not start a second consumer. Stop with Ctrl+C. If the token leaks, rotate it through BotFather, update `.env` and restart.

Production operation requires a dedicated low-privilege OS user, process limits and secret management appropriate to your infrastructure. This preview grants no remote server access or paid service. The package inherits this repository's `UNLICENSED` status; commercial distribution terms are not yet set.
