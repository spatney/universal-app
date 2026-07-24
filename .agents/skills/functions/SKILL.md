---
name: functions
description: >
  Use when the app needs server-side logic that can't run in the browser —
  custom API endpoints, webhooks, background/scheduled jobs, or trusted server
  code (secrets, third-party calls, heavier compute). Rayfin functions provide
  this; the skill turns the service on and scaffolds a handler. Triggers:
  function, functions, serverless, endpoint, API route, webhook, cron, scheduled,
  background job, server-side, backend logic, trigger.
---

# Functions — server-side logic

Rayfin **functions** run trusted code on the server (custom endpoints, webhooks,
background work). They ship **off** in this app.

> **Heads-up: functions is a preview / feature-flagged Rayfin surface.** It is
> gated behind feature flags and may not deploy on Fabric like stable features
> do. Only reach for it when the user genuinely needs server-side logic, and tell
> them it's a preview capability. If the goal can be met with client-side code
> over `data` (with row-level security enforcing trust), prefer that.

## Step 1 — enable the service

Edit `rayfin/rayfin.yml` and add a `functions` block under `services`:

```yaml
services:
  # …existing auth / data / staticHosting…
  functions:
    enabled: true
```

Enabling functions may require the corresponding feature flag at deploy time
(e.g. via `RAYFIN_FEATURE_FLAGS`). Check the docs before assuming it will ship.

## Step 2 — confirm the current functions API + layout

The functions authoring surface (directory location, handler signature,
registration, and any `npm install`) is version-specific. Confirm it before
scaffolding:

```bash
rayfin docs search 'functions' --module guide
```

(or the `search_docs` tool if available). Follow the documented directory
convention and handler shape for the pinned `@microsoft/rayfin-*` version, and
install any package the docs call for.

## Step 3 — scaffold the handler

Create the functions directory/handler the docs specify, keep each handler small
and focused, and call it from the app (or let it run on its trigger/schedule).

## Notes

- Keep secrets and third-party API calls in functions, never in the browser
  bundle.
- Prefer stable features; warn the user that functions is preview before relying
  on it for a deploy (see `AGENTS.md`).
- Deploy with `npm run rayfin:up` to try functions against Fabric.
