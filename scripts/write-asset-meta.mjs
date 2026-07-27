#!/usr/bin/env node
// scripts/write-asset-meta.mjs — write a `<asset>.meta.json` integrity sidecar
// for one prebuilt tarball. Used by CI after creating each node_modules archive
// so scripts/build-manifest.mjs can assemble the release manifest.
//
// Usage:
//   node scripts/write-asset-meta.mjs --file <tarball> --variant <v> \
//        --platform <p> [--out <metafile>]

import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const file = args.file;
if (!file || !args.variant || !args.platform) {
  console.error('Usage: node scripts/write-asset-meta.mjs --file <tarball> --variant <v> --platform <p> [--out <metafile>]');
  process.exit(1);
}
const out = args.out || `${file}.meta.json`;

const buf = readFileSync(file);
const meta = {
  asset: basename(file),
  sha256: createHash('sha256').update(buf).digest('hex'),
  bytes: statSync(file).size,
  variant: args.variant,
  platform: args.platform,
};
writeFileSync(out, JSON.stringify(meta, null, 2) + '\n');
console.log(`meta: ${meta.asset} sha256=${meta.sha256.slice(0, 12)}… bytes=${meta.bytes}`);
