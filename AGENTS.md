# Universal App — agent guide

> **You're an agent** working in a **lean, universal Rayfin app** (a Microsoft
> Fabric Backend-as-a-Service app). It ships as a tiny "hello world" and is
> designed to **grow into whatever the user asks for** — a CRUD app, a charts
> dashboard, a Power BI analytics dashboard, or any mix. Your job is to grow it
> **on demand**, pulling in only the capabilities the request actually needs.

**Before you write any code, do two things:**

1. **Route first.** Read the **`capability-router` skill**
   (`.agents/skills/capability-router/SKILL.md`). It maps a plain-English request
   to a set of **capability packs**, and for each one tells you exactly what to
   turn on: which Fabric **service** to enable, which npm **modules** to install,
   which **code** to scaffold, and which **skill** to read for the patterns.
2. **Stay lean.** Don't enable services, install modules, or copy in kit code the
   request doesn't need. The whole point of this template is that it starts small
   and only grows where the user is going.

---

## What ships in the base

A minimal React 19 + Vite app, Fabric-ready but deliberately bare:

- A no-auth `HomePage` (`src/pages/HomePage.tsx`) rendered by `src/App.tsx` — so
  it previews with **no backend** (`npm run preview`).
- **Fabric auth scaffolding, wired OFF** under `src/services/` +
  `src/hooks/AuthContext.tsx` — the base is a static, public page, so it needs no
  auth. **Wire auth in as soon as the app uses data** (see the rule in Rules).
- **Graphein** wired in for charts: `src/components/Chart.tsx` (+ `useChart.ts`)
  renders a declarative `<Chart spec={…} />`. The `graphein-visuals` pack covers
  authoring specs.
- An **empty data schema** (`rayfin/data/schema.ts`) and `rayfin/rayfin.yml` with
  `auth` + `data` (mssql) + `staticHosting` enabled. The analytics stack is
  **absent** until the analytics pack turns it on.

## The capability packs

Each pack is a skill under `.agents/skills/`, trigger-gated so it only fires when
relevant. The router picks packs; the pack skill has the details.

| Pack (skill) | Turn it on when the user wants… |
|---|---|
| `authentication` | Sign-in, accounts, login, protected pages, per-user data |
| `data-modeling` | Records, CRUD, a database, entities, row-level security |
| `graphein-visuals` | Charts, graphs, KPIs, tables, a simple dashboard |
| `analytics` | Power BI / semantic-model dashboards, DAX, BI reporting |

The `analytics` pack also brings its own supporting skills (`build-workflow`,
`visuals`, `dax`, `fabric-data`, `app-design`, `headless-preview`) — read those
only when you're on the analytics path.

> **Fast path — one command.** A pack that ships a `pack.json` manifest turns on
> with a single idempotent command instead of dozens of manual steps:
>
> ```sh
> npm run pack:add -- <pack>      # e.g. analytics
> ```
>
> It enables the service, installs the pinned modules, copies the kit, wires the
> scripts, seeds a runnable demo, and installs deps from the **prebuilt cache**
> (falling back to `npm install`). **`analytics`** ships a
> manifest today; more capabilities/connectors will adopt the same mechanism.
> See `.agents/skills/capability-router/pack-manifest.md`.

---

## Fast dependency install

Dependencies come from a **prebuilt, per-platform `node_modules` cache** so you
don't wait on a cold `npm install`:

- **`npm run setup`** downloads the `node_modules` tarball matching this
  platform + lockfile from the template's `deps-cache` GitHub Release and
  extracts it. If the cache is missing for your platform it **falls back to a
  normal install**, and it's a **no-op** when `node_modules` already exists.
- Scaffolding runs `rayfin init … --skip-install` then `npm run setup`, so the
  base app is ready fast.
- `npm run pack:add -- <pack>` uses the same cache for a pack's deps (e.g.
  `analytics`), falling back to `npm install` automatically.

The cache is published by `.github/workflows/build-deps-cache.yml` — nothing to
maintain by hand.

---

## Rules

- **Make the requested code changes only**, and keep the project building —
  prefer small, correct increments.
- **Deploy to Fabric with `npm run rayfin:up`** (i.e. `rayfin up`) when you want
  to see the app running. `npm run preview` serves the base app locally with no
  backend for a quick look; `npm run dev` runs it against your deployment. A real
  deploy is needed once the app requires auth or data.
- **Only use what Rayfin natively provides** (auth, data, static hosting) — don't
  add external services like payment processors or email senders. Prefer
  **stable, Fabric-supported** features unless the user asks for an experimental
  one.
- **Installing npm modules is expected** — install what a pack needs; don't
  pre-install everything.
- **Auth follows data.** Rayfin data is always accessed as an authenticated user
  (no anonymous access on Fabric), so **wire authentication whenever the app uses
  or connects to data** — `data-modeling`, per-user rows, row-level security. A
  **static page over public data** needs no auth. (Analytics reads its Power BI
  model through the Fabric embed proxy, which Fabric authenticates.)

When you finish a capability, build and deploy (`npm run rayfin:up`) to see it on
Fabric.

## If you're asked to…

| Task | Start here |
|---|---|
| Build "an app" / anything, from scratch | **`capability-router`** — classify the request, then pull in packs |
| Add sign-in / accounts / per-user data | `authentication` |
| Store records / build CRUD / add a table | `data-modeling` |
| Restrict rows to their owner | `data-modeling` → row-level security |
| Add a chart / KPI / small dashboard | `graphein-visuals` |
| Build a Power BI / semantic-model dashboard | run **`npm run pack:add -- analytics`**, then `analytics` (then its sub-skills) |
| Make it look polished / themed | the relevant pack's styling notes + Tailwind theme in `src/main.css` |
