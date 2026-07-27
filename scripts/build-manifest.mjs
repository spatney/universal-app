#!/usr/bin/env node
// scripts/build-manifest.mjs — assemble the cache release manifest.
//
// Each CI build job drops a `<asset>.meta.json` sidecar next to its tarball.
// This scans a directory (recursively) for those sidecars and merges them into
// a single `manifest.json` that `scripts/fetch-deps.mjs` reads to discover the
// asset name → sha256 mapping (integrity) for its variant + platform.
//
// Usage:
//   node scripts/build-manifest.mjs --in <dir> --out <manifest.json> [--tag <tag>]

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { RELEASE_TAG } from './deps-cache-lib.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.meta.json')) acc.push(p);
  }
  return acc;
}

const args = parseArgs(process.argv.slice(2));
const inDir = args.in;
const outPath = args.out;
const tag = args.tag || RELEASE_TAG;
if (!inDir || !outPath) {
  console.error('Usage: node scripts/build-manifest.mjs --in <dir> --out <file> [--tag <tag>]');
  process.exit(1);
}

const assets = {};
for (const metaPath of walk(inDir)) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  if (!meta.asset || !meta.sha256) {
    console.warn(`skipping malformed meta: ${metaPath}`);
    continue;
  }
  assets[meta.asset] = {
    sha256: meta.sha256,
    bytes: meta.bytes,
    variant: meta.variant,
    platform: meta.platform,
  };
}

const manifest = {
  generatedAt: new Date().toISOString(),
  tag,
  assets,
};
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath} with ${Object.keys(assets).length} asset(s):`);
for (const name of Object.keys(assets).sort()) console.log(`  - ${name}`);
