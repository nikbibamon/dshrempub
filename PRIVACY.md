# Data sent by Tvijo DSHREM

The extension sends a question, conversation history, selected code and explicitly
attached text to the configured service when you press **Ask**. It does not scan your
workspace automatically. A file chosen, pasted or dropped from your computer is first
transferred to the VS Code extension host (the SSH server in a Remote SSH window).
Tesseract extracts text there. FFmpeg, when installed, generates a small grayscale
text thumbnail for layout. Both run on the extension host. When you press **Ask**,
the service receives the previewed text and thumbnail. The original image file
stays on the extension host.

**Send pixels to Codex for analysis** is a separate action for one PNG or JPEG.
FFmpeg prepares one color PNG without source metadata. The verified Codex CLI
sends that frame directly to ChatGPT under the CLI account's subscription. The
image request carries a fixed observation prompt and a generic attachment label.
Draft text, chat history, project files and rules are outside the request. The
CLI runs with an isolated filesystem and a tool-free profile on supported Linux
x64 extension hosts. This action uses the account's Codex allowance.

Tvijo writes the normalized frame and invocation state to a private temporary
directory under its extension-host storage for this action and removes it
when the helper returns. The observation stays in the composer until dismissed,
superseded, or explicitly included in a local DS41F Chat message. Inclusion
sends quoted observation text as part of that ordinary Tvijo request. OpenAI's
processing of the separate image request follows the ChatGPT account's data
controls and terms.
Avoid selecting credentials or private data you are not authorized to send.

Unsubmitted attachments and image previews remain in extension-host memory until sent,
removed, or the host reloads.
Submitted file text, OCR and thumbnails can enter conversation history. The composer
draft is kept in VS Code webview state. A separate
**Add file to my knowledge base** command requires confirmation and stores the file's
text in the service knowledge base. Attaching a file to a question does not add it there.

The login token is stored in VS Code SecretStorage. Conversation history is kept
in the extension workspace state. Signing out removes the local login token;
starting a new conversation clears local conversation state. Neither action
claims to delete records already stored by the service.

The service processes submitted content to answer the request and may retain
uploaded knowledge, account records, task identifiers, usage, cost and error
records. Requests may be processed by upstream model services. Server retention,
deletion and upstream data terms must be agreed for a production deployment;
this preview makes no zero-retention, training-exclusion or certification claim.

This extension adds no independent advertising or analytics SDK. The service
accounts for tasks and usage. It never asks for a model-provider API key.

Customer access is provisioned by the operator. Free trials, when offered, are
finite service credits, not unlimited tokens or access to the operator's account.

## Self-hosted DSHREMBOT local preview

The optional `bot/` preview keeps its BotFather token in the local process environment
(the documented `.env` file remains on the machine running the bot). It sends Bot API
requests directly to Telegram. For the configured owner only, `/status` sends that
machine's hostname, uptime, one-minute load and free space on `/` as a Telegram message.
Pairing mode replies with the requester's numeric Telegram ID and stops. The preview
has no Tvijo backend connection, model calls, repository upload, analytics SDK, shell
execution or remote server command feature. Generic HTTP error codes may be logged
locally; the bot does not print its token, raw Telegram responses or message text.
Telegram's own processing and retention of bot messages is governed by Telegram's
terms. Stop the process and rotate the token with BotFather if the server or token is
compromised.
