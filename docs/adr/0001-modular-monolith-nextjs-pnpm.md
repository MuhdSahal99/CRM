# ADR-0001: Modular monolith on Next.js App Router, pnpm workspaces

## Status
Accepted

## Date
2026-10-27

## Context
The team is small: 4 reps, 1 manager, and a small dev team. The MVP is 11 vertical slices (PRD §5). The PRD needs a web UI that works on a 360 px phone, a REST API that mirrors Zoho (reference §7), and background work: PDF rendering, SMTP sends, and CSV imports. TypeScript runs end to end so the client and server share the same Zod schemas.

## Decision
- One repo using **pnpm workspaces**:
  - `apps/web`: Next.js App Router. It holds the UI (server components) and the REST route handlers under `/api/v1`.
  - `apps/worker`: a Node process that runs the BullMQ workers (`pdf`, `email`, `import`).
  - `packages/db`: the Drizzle schema, migrations, and seed data (including seeded test users).
  - `packages/core`: the Zod schemas, the pricing engine, the visibility and permission helpers, and the domain services.
- Route handlers and server components both call the **same service layer** in `packages/core`. Nothing reads the DB from a component.
- In Next.js 16, `middleware.ts` became `proxy.ts` (Node runtime only). We use it only for session cookie presence and locale. Authorization is enforced in the services and in the DB, never in the proxy.
- Versions are pinned exactly in the lockfile. Baseline checked with `npm view` on 2026-10-27: next 16.4.x, react 19.3.x, typescript 7.0.x, zod 4.6.x, pnpm 12.x, vitest 5.0.x, playwright 1.64.x.
- **TypeScript fallback.** TS 7 (the native compiler) is new. If any tool in the chain does not support it yet (Next.js type-check, drizzle-kit, ESLint typed rules, vitest), pin **TypeScript 5.9** for the whole workspace. Record the blocking tool in this ADR and upgrade when it gains support. We do not mix TS versions across packages.

## Alternatives considered
- **NestJS API + separate React SPA** (reference §9). We would run two deployables and two routers, and still need SSR for fast first paint on phones. Rejected for MVP team size.
- **Microservices.** No scaling or team boundary justifies them at 5 users or 50 tenants.

## Consequences
- One deploy artifact for web and one for the worker, both built from the same commit.
- Domain logic stays framework-free in `packages/core`, so it can be unit-tested without Next.js.
- If the API later needs to scale separately from the UI, the route handlers can be extracted, because they are thin.
