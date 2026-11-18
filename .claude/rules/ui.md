---
paths:
  - "app/**"
  - "src/components/**"
  - "src/styles/**"
---

# UI changes

Authoritative spec: `docs/design-system.md`. Before finishing:

- Use tokens from `src/styles/tokens.css`; no raw hex or ad-hoc spacing in components.
- Meaning never by color alone (badges have shape + text; Saturday/Sunday also have labels).
- Pages that read data: data component inside `<Suspense>`, request-time (`params`/`searchParams` or `io()`), skeleton fallback, empty and error states.
- Every chart has a takeaway computed from data, a scope/unit line and a table view.
- Verify with the `verify-ui` skill at desktop and mobile in light and dark.
