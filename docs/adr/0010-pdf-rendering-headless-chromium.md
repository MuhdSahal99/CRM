# ADR-0010: PDF rendering with headless Chromium in the worker

## Status
Accepted

## Date
2026-10-27

## Context
- Quote and Invoice PDFs must meet the Oman tax-invoice content rules (US-12).
- They are English-only in the MVP but may become bilingual Arabic + English (OQ-02), which needs correct Arabic shaping and bidi.
- PDFs must be identical every time they are re-opened.

## Decision
- **Rendering.** Templates are React components rendered to HTML on the server, then printed to PDF by **headless Chromium** (puppeteer-core + a pinned Chromium build in the worker image). Chromium's text stack handles Arabic shaping, RTL and mixed-direction text, so OQ-02 needs only template work.
- **Isolation.**
  - Rendering runs only in `apps/worker` (queue `pdf`), never in the web request path.
  - Chromium runs with no network access: request interception blocks everything except `data:` URIs.
  - Fonts and logos are embedded.
  - Template data is escaped by React. Rich text such as Terms & Conditions is sanitised with an allowlist.
- **Immutability.**
  - An issued Invoice is rendered once on issue and stored as an immutable `files` row with a content hash.
  - A Quote is rendered on demand, or when it is sent or shared. Each render creates a new file version.
- **Fonts.** A bundled OFL font with Arabic coverage (e.g. Noto Sans + Noto Naskh Arabic).

## Alternatives considered
- **@react-pdf/renderer.** Lighter, but its Arabic shaping and bidi support is limited. That would put OQ-02 at risk.
- **Hosted PDF API.** Sends customer PII to a third party outside the GCC (OQ-03).

## Consequences
- The worker image is larger (~150 MB more), and its Chromium must be patched on its own schedule. It is tracked in the dependency audit.
- Rendering latency (~1 s) never sits on the p95 path for API requests.
