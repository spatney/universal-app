// scripts/deps-cache-lib.mjs — shared logic for the prebuilt dependency cache.
//
// Both the client (`scripts/fetch-deps.mjs`) and CI
// (`.github/workflows/build-deps-cache.yml`) import this module so the cache
// KEY, PLATFORM id, and ASSET NAME are computed the exact same way on both
// sides. If they ever diverge, the client would never find the asset CI
// published — so this single source of truth is deliberately dependency-free.
//
// Runnable as a tiny CLI so shell-based CI can read a value without duplicating
// the logic:
//   node scripts/deps-cache-lib.mjs --variant base            --field asset
//   node scripts/deps-cache-lib.mjs --variant analytics       --field key
//   node scripts/deps-cache-lib.mjs --variant base --platform linux-x64 --field asset
//
// Fields: asset | key | short | platform | tag | repo | manifest

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Canonical template repo that HOSTS the cache release. Not the user's derived
 *  project — a scaffolded app still pulls its cache from here. Override with
 *  DEPS_CACHE_REPO for forks/testing. */
export const DEFAULT_REPO = 'spatney/universal-app';
/** Rolling release tag that CI keeps updated with the newest tarballs. */
export const RELEASE_TAG = 'deps-cache';
export const MANIFEST_NAME = 'manifest.json';

export const VARIANTS = ['base', 'analytics'];
export const SUPPORTED_PLATFORMS = [
  'linux-x64',
  'darwin-arm64',
  'darwin-x64',
  'win32-x64',
];

/** Files (relative to repo root) whose contents fully determine each variant's
 *  resolved dependency tree. The client can hash these BEFORE any install, so it
 *  can compute the key without resolving anything. */
export function variantInputs(variant) {
  switch (variant) {
    case 'base':
      return ['package-lock.json'];
    case 'analytics':
      return ['package-lock.json', '.agents/skills/analytics/pack.json'];
    default:
      throw new Error(
        `Unknown variant "${variant}". Known: ${VARIANTS.join(', ')}`,
      );
  }
}

export function repoSlug() {
  return process.env.DEPS_CACHE_REPO || DEFAULT_REPO;
}

/** `${platform}-${arch}` e.g. "win32-x64", "darwin-arm64". */
export function detectPlatform() {
  return `${process.platform}-${process.arch}`;
}

export function isSupportedPlatform(platform) {
  return SUPPORTED_PLATFORMS.includes(platform);
}

/** Full sha256 (hex) over the concatenated bytes of a variant's inputs, in a
 *  fixed order, each prefixed with a length-delimited header so distinct file
 *  boundaries can never collide. */
export function computeLockHash(variant, rootDir = ROOT) {
  const hash = createHash('sha256');
  for (const rel of variantInputs(variant)) {
    const abs = join(rootDir, rel);
    if (!existsSync(abs)) {
      throw new Error(`Cache input missing: ${rel}`);
    }
    const buf = readFileSync(abs);
    hash.update(`${rel}:${buf.length}\n`);
    hash.update(buf);
  }
  return hash.digest('hex');
}

/** Short, human-friendly slice of the lock hash used in asset names. */
export function shortHash(variant, rootDir = ROOT) {
  return computeLockHash(variant, rootDir).slice(0, 16);
}

/** Release asset filename for a variant + platform. gzip (.tar.gz) is used so
 *  any bsdtar/GNU tar on the four target OSes can extract it. */
export function assetName(variant, platform, rootDir = ROOT) {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`Unknown variant "${variant}"`);
  }
  return `node_modules-${variant}-${platform}-${shortHash(variant, rootDir)}.tar.gz`;
}

/** Public HTTPS URL for a release asset (works without auth on a public repo).
 *  DEPS_CACHE_BASE_URL overrides the host entirely (private mirror / local test);
 *  the asset name is appended as-is. */
export function assetUrl(name, repo = repoSlug(), tag = RELEASE_TAG) {
  const base = process.env.DEPS_CACHE_BASE_URL;
  if (base) return `${base.replace(/\/+$/, '')}/${name}`;
  return `https://github.com/${repo}/releases/download/${tag}/${name}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

// CLI: print a single field so shell-based CI can consume it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const variant = args.variant || 'base';
  const platform = args.platform || detectPlatform();
  const field = args.field || 'asset';
  let value;
  switch (field) {
    case 'asset':
      value = assetName(variant, platform);
      break;
    case 'key':
      value = computeLockHash(variant);
      break;
    case 'short':
      value = shortHash(variant);
      break;
    case 'platform':
      value = platform;
      break;
    case 'tag':
      value = RELEASE_TAG;
      break;
    case 'repo':
      value = repoSlug();
      break;
    case 'manifest':
      value = MANIFEST_NAME;
      break;
    default:
      console.error(`Unknown --field "${field}"`);
      process.exit(1);
  }
  process.stdout.write(`${value}\n`);
}
