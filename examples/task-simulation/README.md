# Local task simulation

From the repository root run `python3 -m http.server 8080 --bind 127.0.0.1`,
then open `http://127.0.0.1:8080/examples/task-simulation/` in a modern browser.
Serve only this repository on loopback; do not expose a private working directory.
Stop the server when finished. No dependency install or build is needed.

This static example uses the existing pure task-state, observation and injected
simulation modules. Every reservation, identity, fingerprint, reply, USD amount
and save acknowledgement is fictional. No account, transport, auth, actual
inference, durable storage, service worker, manifest or installable PWA is wired.
The constant fingerprint is a mock fixture, not a hash binding the typed message.
The browser loads only local static files; the CSP forbids connections.

Start a task, send once, then explicitly check status. Even a visible scripted
reply is not settlement. Unknown reply models a lost callback after the fake
server completed. Cancel acknowledgement likewise needs a full status check.
Scenario and message are fixed while a task remains unsettled. Simulated offline
blocks effects; reconnect does not replay. At most 256 tasks can be created in
one page lifetime, matching the core's bounded non-evicting history.

Save fails after reserve models an ambiguous post-effect save. All displayed
budget values become Unknown. Restore saved copy uses only the last acknowledged
**in-memory** copy, explicitly confirms the synthetic identity, and requires a
manual Recover task lookup. That lookup returns the original fake task instead
of creating another. Nothing survives reload, including the fake server map and
saved copy. This demonstrates control flow, not real crash recovery or security.
No reset button bypasses an unsettled task. Reload deliberately starts a wholly
new fictional world and is not a production recovery recipe.

For offline checks use Simulate offline; actual network loss is not measured.
Only fixed copy and text nodes are rendered. No vendor/model names, keys or raw
callback payloads/errors appear in the UI. The optional activity log holds the
latest 30 human-readable events. No external fonts, libraries or images are used.
