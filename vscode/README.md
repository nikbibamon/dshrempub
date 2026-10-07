# Tvijo DSHREM for VS Code

Ask questions about your code from the editor. Answers cite the files you added to your
private knowledge base, and every question runs as one task with a hard 1 USD cap.

## What you get

- **Sign in with your account, not an API key.** `Tvijo: Sign in` shows a short code; you
  approve it in the browser where you are already signed in. The token is kept in VS Code
  secret storage and works only with the service URL it was issued for.
- **Ask about a selection.** Select code, press `Ctrl+Alt+T` (`Cmd+Alt+T` on macOS) or use
  the context menu. The answer opens beside your code with the cited evidence and the
  task's spent and held amounts.
- **Your own knowledge base.** Right-click a file → `Tvijo: Add file to my knowledge base`.
  Upload is explicit and confirmed; credential files, binary files and files that look
  like they contain secrets are refused.
- **Account and credit.** Click the status bar item.

## When it is not the right tool

- It does not edit files, run commands or act on its own. Suggested changes are text for
  you to review.
- One question is one task. A long conversation hits the per-task context bound; start a
  new conversation.
- If a previous task may still hold credit, the next question is refused until you cancel
  it (`Tvijo: Cancel pending task`) or it finishes. Nothing is retried automatically.

## Works in

VS Code 1.90+ and compatible editors that install `.vsix` packages.

## Development

```sh
npm test                      # protocol tests, no VS Code needed
npx @vscode/vsce package      # builds tvijo-dshrem-0.1.0.vsix
code --install-extension tvijo-dshrem-0.1.0.vsix
```

For a local service set `tvijo.apiBase` to `http://localhost:PORT/api/dshrem/v1`.

## License

`UNLICENSED`. No license grant is made here; a public licensing decision is pending.
