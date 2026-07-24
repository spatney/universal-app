---
name: storage
description: >
  Use when the app needs file storage — uploading, storing, or serving files,
  attachments, images, documents, avatars, or blobs. Rayfin provides managed file
  storage; this skill turns the service on and wires upload/download against it.
  Triggers: file, files, upload, download, attachment, image, photo, avatar,
  document, blob, storage, bucket, media.
---

# Storage — managed file storage

Rayfin provides managed file storage. It ships **off** in this app; enable it,
then wire uploads/downloads through the Rayfin client.

## Step 1 — enable the service

Edit `rayfin/rayfin.yml` and add a `storage` block under `services`:

```yaml
services:
  # …existing auth / data / staticHosting…
  storage:
    enabled: true
```

Storage generally needs a signed-in user, so also turn on **authentication** (see
the `authentication` skill) if it isn't already wired.

## Step 2 — confirm the current storage API

The storage surface is accessed through the Rayfin client (e.g.
`getRayfinClient().storage.…` for upload / download / list / delete / URL). Before
writing code, confirm the exact method names and options for the pinned
`@microsoft/rayfin-client` version:

```bash
rayfin docs search 'file storage upload' --module guide
```

(or the `search_docs` tool if available). Follow the documented API rather than
guessing — the shape has evolved across versions.

## Step 3 — wire it in the UI

Typical flow: a file `<input>` → read the `File` → call the client's upload
method → store the returned key/URL (often on a data entity, so compose this with
the `data-modeling` skill) → render via the download/URL method.

## Notes

- Prefer **stable** storage features; if the docs mark something preview/
  experimental, avoid it unless the user explicitly asks (it may not deploy on
  Fabric). See `AGENTS.md`.
- Don't roll your own external blob service — use Rayfin storage.
- Deploy with `npm run rayfin:up` to try storage against Fabric.
