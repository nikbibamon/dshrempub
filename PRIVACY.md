# Data sent by Tvijo DSHREM

The extension sends a question, conversation history, selected code and explicitly
attached text to the configured service when you press **Ask**. It does not scan your
workspace automatically. A file chosen, pasted or dropped from your computer is first
transferred to the VS Code extension host (the SSH server in a Remote SSH window).
Image text is extracted there with Tesseract, without an upstream model call. Images
are not sent to a vision model. Only extracted text is submitted with the question.
Avoid selecting credentials or private data you are not authorized to send.

Unsubmitted attachments and image previews remain in extension-host memory until sent,
removed, or the host reloads. They are not written to temporary files by this extension.
After submission, file contents and OCR text are part of conversation history; original
image bytes are not. The composer draft is kept in VS Code webview state. A separate
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
