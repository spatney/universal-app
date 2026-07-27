#!/usr/bin/env node
// scripts/fetch-deps.mjs — fast dependency install via a prebuilt cache.
//
// Instead of a cold `npm install` (~350 MB / 300+ packages over the network),
// this downloads a prebuilt, platform-matched `node_modules` tarball published
// by CI to the `deps-cache` GitHub Release, verifies its sha256, and extracts it
// with the system `tar`. If ANYTHING is unavailable — unsupported platform,
// missing asset, checksum mismatch, network/extract error — it falls back to a
// normal install so the template always ends up with a working `node_modules`.
//
// It is a safe no-op when `node_modules` is already present (e.g. `rayfin init`
// ran its own install, or a prior `npm run setup`), unless `--force` is given.
//
// Usage:
//   node scripts/fetch-deps.mjs [--variant base|analytics] [--force]
//                               [--offline] [--dry-run]
//   npm run setup                 # base
//   npm run setup:analytics       # base + analytics pack deps
//
// Flags:
//   --variant   Which cached tree to fetch (default: base).
//   --force     Re-fetch even if node_modules already exists.
//   --offline   Skip the network; go straight to the local install fallback.
//   --dry-run   Print what would happen; download/extract nothing.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ROOT,
  RELEASE_TAG,
  MANIFEST_NAME,
  assetName,
  assetUrl,
  computeLockHash,
  detectPlatform,
  isSupportedPlatform,
  repoSlug,
} from './deps-cache-lib.mjs';

const UA = 'universal-app-deps-fetch';
const NM = join(ROOT, 'node_modules');
const NM_MARKER = join(NM, '.package-lock.json'); // npm writes this after install
const REDIRECTS = ['301', '302', '303', '307', '308'].map(Number);

/** Pick http/https by URL scheme (https in production; http only for local tests). */
const getForUrl = (u) => (new URL(u).protocol === 'http:' ? httpGet : httpsGet);

const log = (...m) => console.log('[deps]', ...m);
const warn = (...m) => console.warn('[deps]', ...m);

function parseArgs(argv) {
  const out = { variant: 'base', flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--variant') {
      out.variant = argv[++i];
    } else if (a.startsWith('--variant=')) {
      out.variant = a.slice('--variant='.length);
    } else if (a.startsWith('--')) {
      out.flags[a.slice(2)] = true;
    }
  }
  return out;
}

/** GET a URL to a Buffer, following redirects. */
function fetchBuffer(url, redirects = 6) {
  return new Promise((resolve, reject) => {
    const req = getForUrl(url)(
      url,
      { headers: { 'User-Agent': UA, Accept: 'application/octet-stream' } },
      (res) => {
        if (
          REDIRECTS.includes(res.statusCode) &&
          res.headers.location &&
          redirects > 0
        ) {
          res.resume();
          fetchBuffer(new URL(res.headers.location, url).toString(), redirects - 1)
            .then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
  });
}

/** Stream a URL to a file, following redirects; resolves to the sha256 hex. */
function downloadToFile(url, destPath, redirects = 6) {
  return new Promise((resolve, reject) => {
    const req = getForUrl(url)(
      url,
      { headers: { 'User-Agent': UA, Accept: 'application/octet-stream' } },
      (res) => {
        if (
          REDIRECTS.includes(res.statusCode) &&
          res.headers.location &&
          redirects > 0
        ) {
          res.resume();
          downloadToFile(
            new URL(res.headers.location, url).toString(),
            destPath,
            redirects - 1,
          ).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const hash = createHash('sha256');
        const out = createWriteStream(destPath);
        res.on('data', (c) => hash.update(c));
        res.on('error', reject);
        out.on('error', reject);
        out.on('finish', () => resolve(hash.digest('hex')));
        res.pipe(out);
      },
    );
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('download timeout')));
  });
}

/** Run a local install as the fallback. base is lock-clean → prefer `npm ci`;
 *  pack variants added deps to package.json without updating the lock → use
 *  `npm install`. Returns true on success. */
function localInstall(variant) {
  const hasLock = existsSync(join(ROOT, 'package-lock.json'));
  const attempts =
    variant === 'base' && hasLock
      ? [['ci', '--no-audit', '--no-fund'], ['install', '--no-audit', '--no-fund']]
      : [['install', '--no-audit', '--no-fund']];
  for (const args of attempts) {
    log(`fallback: npm ${args.join(' ')}`);
    // Single-string + shell:true matches scaffold.mjs and avoids Node's DEP0190
    // (args array + shell) warning while staying cross-platform.
    const res = spawnSync(`npm ${args.join(' ')}`, { cwd: ROOT, stdio: 'inherit', shell: true });
    if (res.status === 0) return true;
    warn(`npm ${args[0]} failed (exit ${res.status ?? 'unknown'})`);
  }
  return false;
}

async function fetchFromCache(variant, platform) {
  const repo = repoSlug();
  const asset = assetName(variant, platform);
  log(`platform ${platform}, variant ${variant}`);
  log(`looking for ${asset} in ${repo}@${RELEASE_TAG}`);

  // 1) Manifest → integrity metadata (required; no manifest ⇒ no verified install).
  let manifest;
  try {
    const buf = await fetchBuffer(assetUrl(MANIFEST_NAME, repo, RELEASE_TAG));
    manifest = JSON.parse(buf.toString('utf8'));
  } catch (err) {
    throw new Error(`could not read cache manifest: ${err.message}`);
  }
  const entry = manifest?.assets?.[asset];
  if (!entry?.sha256) {
    throw new Error(`no cache entry for ${asset} (lockfile changed or not built yet)`);
  }

  // 2) Download + verify.
  const tmpDir = mkdtempSync(join(tmpdir(), 'ua-deps-'));
  const tarPath = join(tmpDir, asset);
  try {
    log(`downloading (${(entry.bytes / 1e6).toFixed(1)} MB)…`);
    const sha = await downloadToFile(assetUrl(asset, repo, RELEASE_TAG), tarPath);
    if (sha !== entry.sha256) {
      throw new Error(`checksum mismatch (expected ${entry.sha256.slice(0, 12)}…, got ${sha.slice(0, 12)}…)`);
    }

    // 3) Replace node_modules with the extracted tree.
    if (existsSync(NM)) {
      log('removing existing node_modules…');
      rmSync(NM, { recursive: true, force: true });
    }
    log('extracting…');
    const ex = spawnSync('tar', ['-xf', tarPath, '-C', ROOT], { stdio: 'inherit' });
    if (ex.status !== 0) {
      throw new Error(`tar exited ${ex.status ?? 'unknown'}`);
    }
    if (!existsSync(NM_MARKER)) {
      throw new Error('extracted tree is missing node_modules/.package-lock.json');
    }
    writeFileSync(
      join(NM, '.deps-cache.json'),
      JSON.stringify(
        { variant, platform, lockHash: computeLockHash(variant), source: 'cache', at: new Date().toISOString() },
        null,
        2,
      ) + '\n',
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const { variant, flags } = parseArgs(process.argv.slice(2));

  if (!flags.force && existsSync(NM_MARKER)) {
    log('node_modules already present — nothing to do (use --force to refetch).');
    return;
  }

  const platform = detectPlatform();

  if (flags['dry-run']) {
    const supported = isSupportedPlatform(platform);
    log(`dry-run: variant=${variant} platform=${platform} supported=${supported}`);
    if (supported) {
      log(`would fetch ${assetUrl(assetName(variant, platform))}`);
    } else {
      log('would fall back to a local npm install');
    }
    return;
  }

  if (flags.offline) {
    log('offline — using local install.');
    if (!localInstall(variant)) process.exit(1);
    return;
  }

  if (!isSupportedPlatform(platform)) {
    warn(`no prebuilt cache for ${platform}; using local install.`);
    if (!localInstall(variant)) process.exit(1);
    return;
  }

  try {
    await fetchFromCache(variant, platform);
    log('done (installed from prebuilt cache).');
  } catch (err) {
    warn(`cache unavailable: ${err.message}`);
    log('falling back to a local install…');
    if (!localInstall(variant)) process.exit(1);
  }
}

main().catch((err) => {
  warn(err.stack || String(err));
  process.exit(1);
});
