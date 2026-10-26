# TVIJO practical guide

Published at https://tvijo.com/guide. English is the default; complete Russian,
Ukrainian, German, Spanish, Portuguese and Dutch editions use `?lang=ru`, etc.

Deploy only `index.html`, `guide.css`, `guide-data.js` and `guide.js` at `/guide`.
No package installation, server API, account or paid model call is needed.
The manifest records the exact published hashes. Locale text is in guide-data.js;
index.html also contains the complete English fallback for browsers without JavaScript.
Keep both representations consistent when editing English content.

For local preview from the repository root:

```sh
python3 -m http.server 8000 --directory docs
```

Open http://localhost:8000/guide/. Use a static CSP allowing scripts and styles
from self, with no connect/frame/object sources. The live route uses no-cache
and a versioned static directory so changes do not require rebuilding the main site.

The bundled VSIX offline edition is Russian and links to the multilingual site.
Project templates are examples to review, never automatic overrides of user rules.
No general development-speed or cost-reduction percentage is claimed.
