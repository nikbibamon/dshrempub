# Attributable task receipts — source candidate

Requested GPT-6.1 Sol; served identity unknown. Programme TVIJO-PROGRAMME-V3-20261110, 10 November 2026.

This additive projection uses the existing editor task receipt, retained journal and renderer. It does not add an executor, authentication mode or key store. The current service quote/reservation/chat flow in `workspace.js` and SecretStorage handling in `extension.js` remain authoritative. A receipt enters the new field only when the observed service task ID and server-confirmed project match the current task and project. Older responses without that attribution remain unconfirmed.

Service credit debits/holds use integer `micro_tvijo`; reported provider USD remains Decimal text. Invoice and runtime ACK remain unknown. Worker prose, an exit code or an observed file edit cannot create independent acceptance. The existing local diagnostic cost display is retained for compatibility; the new fields do not turn it into an authoritative financial ledger or sum repeated representations as new invoices.

Customer-local BYOK requires explicit local secret storage and consent for metadata export; server budget enforcement cannot bound calls it does not mediate. Existing managed BYOK uses server-side references and separate consent/revocation checks. Subscription integration needs an officially supported customer identity; the owner account is never distributed or proxied. None of these readiness states is established by this projection patch.

Source tests and a rendered receipt are different from a packaged, installed VSIX or a customer workflow. Version0.10.28 is the verified source base, not a new published release. Independent review, existing release gates and actual native smoke are required before publication.

## Independent-review corrections R2

The first scoped Terra review rejected the initial candidate. The actual gateway public BYOK field is `provider_cost_usd`, with `reported` or `estimated` provenance; it is now preserved as exact Decimal text, including precision beyond service units. Unknown/unrecognized or unsettled task outcomes and unsupported cost provenance retain a null total. A reported, settled zero remains distinct. Invoice cost remains null. The MCP quote also restricts tariff versions to the actual server `pilot-` plus20hex format; arbitrary credential-shaped text and trailing controls are refused. Original failed review and exact revisions are retained in programme evidence. Root affected checks pass (MCP34, VSIX21); repeat independent acceptance remains pending.

## Independent-review corrections R3

Terra R2 found missing or inconsistent provider-cost provenance, estimated zero being treated as known, and an omitted expired display state. The projection now requires an exact supported source/status pair, keeps estimated zero unknown without float conversion, refuses a positive rejection charge, and recognizes expired consistently. Targeted root fixtures: MCP43 and VSIX30 PASS. Independent acceptance is separate and pending; earlier reviews remain preserved.
