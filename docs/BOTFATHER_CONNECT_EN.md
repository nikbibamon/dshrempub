# Connect your own Telegram bot to DSHREM

Current status: **request an assisted customer pilot**, not automatic activation. The existing DSHREMBOT serves the Tvijo operator only. Never send your bot token in a public form, Telegram chat, issue, email or repository.

1. Install the [public VS Code preview](https://github.com/nikbibamon/dshrempub/releases/tag/v0.1.1-preview.1) or read the terminal client instructions in the [README](../README.md). Service access is provisioned by the operator; downloading the package does not create a paid account or grant free tokens.
2. Open [@BotFather](https://t.me/BotFather) in Telegram, send `/newbot`, and choose a name and unique username. BotFather will issue a token. Treat it like a password and revoke it in BotFather if exposed. See [Telegram's official guide](https://core.telegram.org/bots/tutorial).
3. On the [DSHREM + bot page](https://tvijo.com/static/dshrem-platform-en-20261018.html), choose “Request bot pilot”. In the Tvijo form, describe one task, the bot @username, the read-only server checks you need, and your desired spending limit. **Do not enter the token, SSH keys, passwords or model-provider keys.**
4. Once an isolated customer workspace exists, Tvijo will provide an authenticated secret-entry flow. Keep the token with you until that flow is available and verified. The future connector must validate ownership and Bot API `getMe`, use a separate webhook secret, support revocation and isolate tasks by customer.
5. Server control is enabled separately: read-only status first, then allowlisted hosts and commands. Changes to a server require separate approval. The shared operator swarm and CLI subscriptions are not transferred to customers.

The proposed **$10** pilot limit is not an active payment or invoice. Price, token metering, stop-at-limit behavior, data handling and refund terms must be agreed before paid work. The [privacy policy](../PRIVACY.md) covers the current preview; customer bot terms will be published before launch.
