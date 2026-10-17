# Data sent by Tvijo DSHREM

The extension sends a question, conversation history and any selected code to the
configured service when you run **Tvijo: Ask**. It does not scan or upload your
workspace automatically. File uploads require the separate **Add file to my
knowledge base** command and confirmation. Avoid selecting credentials or private
data you are not authorized to send.

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
