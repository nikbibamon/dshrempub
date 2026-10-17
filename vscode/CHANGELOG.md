# Changes

## 0.1.1

- Enforce the response-size limit during streaming, including responses without
  a Content-Length header.
- Keep cancellation and request timeout active until the response body is read.
- Document the preview data flow and the boundary between customer credits and
  the operator's subscription.

The preview remains a remote code-analysis client. Marketplace publication and
production enrollment require separate verified release evidence.
