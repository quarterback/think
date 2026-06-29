#!/usr/bin/env node
// sync-standard.mjs — make this static site compatible with standard.site.
//
// Creates / updates the AT Protocol records that standard.site indexes:
//   • one site.standard.publication record for the whole site
//   • one site.standard.document record per page listed in standard.config.json
// then writes the verification artifacts back into the repo:
//   • /.well-known/site.standard.publication   (the publication AT-URI)
//   • <link rel="site.standard.document" ...>  injected into each page's <head>
//
// Record keys are remembered in standard-mapping.json so re-runs update the
// same records instead of creating duplicates. No third-party dependencies —
// just Node 20+ (global fetch). See README for the env vars it needs.
//
// Usage:  node scripts/sync-standard.mjs            (real run)
//         node scripts/sync-standard.mjs --dry-run  (no network writes)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");

const HANDLE = (process.env.BLUESKY_HANDLE || "").trim().replace(/^@/, "");
const APP_PASSWORD = (process.env.BLUESKY_APP_PASSWORD || "").trim();
const SERVICE = (process.env.BLUESKY_SERVICE || "https://bsky.social").replace(/\/$/, "");

const PUB_COLLECTION = "site.standard.publication";
const DOC_COLLECTION = "site.standard.document";
const MAPPING_PATH = join(ROOT, "standard-mapping.json");
const CONFIG_PATH = join(ROOT, "standard.config.json");
const WELL_KNOWN_PATH = join(ROOT, ".well-known", PUB_COLLECTION);
const MARK_OPEN = "<!-- standard.site -->";
const MARK_CLOSE = "<!-- /standard.site -->";

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function log(msg) {
  console.log(msg);
}

// ── tiny helpers ────────────────────────────────────────────────────────────
function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}
function deepEqual(a, b) {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v)
      .sort()
      .reduce((o, k) => ((o[k] = sortKeys(v[k])), o), {});
  }
  return v;
}
function decodeEntities(s) {
  return s
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// Expand include globs (supports "dir/*.html", "*.html", and literal paths).
function expandIncludes(includes, excludes) {
  const exclude = new Set((excludes || []).map((p) => p.replace(/^\.?\//, "")));
  const out = new Set();
  for (const pattern of includes || []) {
    const clean = pattern.replace(/^\.?\//, "");
    if (!clean.includes("*")) {
      if (existsSync(join(ROOT, clean))) out.add(clean);
      continue;
    }
    const dir = dirname(clean) === "." ? "" : dirname(clean);
    const re = new RegExp(
      "^" + clean.split("/").pop().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$"
    );
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (re.test(name)) out.add(dir ? `${dir}/${name}` : name);
    }
  }
  return [...out].filter((p) => !exclude.has(p)).sort();
}

function firstCommitDate(relPath) {
  try {
    const out = execSync(`git log --diff-filter=A --follow --format=%aI -- "${relPath}"`, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const lines = out.split("\n").filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

function cleanTitle(raw, stripNames) {
  // Split on common separators and drop any segment that is just the site name,
  // so "Reading — Ron Bronson" and "Ron Bronson — About" both reduce sensibly.
  const strip = (stripNames || []).map((s) => s.toLowerCase());
  const parts = raw
    .split(/\s+[—–·|]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept = parts.filter((p) => !strip.includes(p.toLowerCase()));
  return (kept.length ? kept : parts).join(" — ");
}

function extractMeta(html, stripNames) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, " ")) : null;
  if (title) title = cleanTitle(title, stripNames);
  // Backreference \1 so an apostrophe inside double-quoted content doesn't end the match.
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  let description = null;
  if (descMatch) {
    const c = descMatch[0].match(/content=(["'])([\s\S]*?)\1/i);
    if (c) description = decodeEntities(c[2].replace(/\s+/g, " "));
  }
  return { title, description };
}

// ── AT Protocol / XRPC ──────────────────────────────────────────────────────
async function xrpc(host, method, { auth, body, query } = {}) {
  const isQuery = body === undefined;
  let url = `${host}/xrpc/${method}`;
  if (query) url += "?" + new URLSearchParams(query).toString();
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${auth}`;
  let init = { method: isQuery ? "GET" : "POST", headers };
  if (!isQuery) {
    if (body instanceof Uint8Array) {
      headers["Content-Type"] = "application/octet-stream";
      init.body = body;
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} → ${res.status} ${json.error || ""} ${json.message || text}`.trim());
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function resolvePds(did, session) {
  // Prefer the didDoc returned with the session, else fall back to a directory.
  const fromDoc = (doc) => {
    const svc = (doc?.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer"
    );
    return svc?.serviceEndpoint || null;
  };
  if (session?.didDoc) {
    const ep = fromDoc(session.didDoc);
    if (ep) return ep.replace(/\/$/, "");
  }
  try {
    if (did.startsWith("did:plc:")) {
      const doc = await (await fetch(`https://plc.directory/${did}`)).json();
      const ep = fromDoc(doc);
      if (ep) return ep.replace(/\/$/, "");
    } else if (did.startsWith("did:web:")) {
      const host = did.slice("did:web:".length).replace(/:/g, "/");
      const doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
      const ep = fromDoc(doc);
      if (ep) return ep.replace(/\/$/, "");
    }
  } catch {
    /* fall through */
  }
  return SERVICE; // last resort: the entryway proxies writes
}

async function ensureRecord(pds, jwt, did, collection, rkey, value) {
  if (rkey) {
    try {
      const existing = await xrpc(pds, "com.atproto.repo.getRecord", {
        auth: jwt,
        query: { repo: did, collection, rkey },
      });
      if (deepEqual(existing.value, { $type: collection, ...value })) {
        return { uri: existing.uri, rkey, changed: false };
      }
    } catch (e) {
      if (e.status !== 400) throw e; // 400 = not found → fall through to create
      rkey = null;
    }
  }
  const record = { $type: collection, ...value };
  if (DRY_RUN) {
    return { uri: `at://${did}/${collection}/${rkey || "<new>"}`, rkey: rkey || "<new>", changed: true };
  }
  if (rkey) {
    const r = await xrpc(pds, "com.atproto.repo.putRecord", {
      auth: jwt,
      body: { repo: did, collection, rkey, record },
    });
    return { uri: r.uri, rkey, changed: true };
  }
  const r = await xrpc(pds, "com.atproto.repo.createRecord", {
    auth: jwt,
    body: { repo: did, collection, record },
  });
  return { uri: r.uri, rkey: r.uri.split("/").pop(), changed: true };
}

// ── HTML injection ──────────────────────────────────────────────────────────
function injectLinkTag(absPath, atUri) {
  let html = readFileSync(absPath, "utf8");
  const block = `${MARK_OPEN}\n<link rel="site.standard.document" href="${atUri}" />\n${MARK_CLOSE}`;
  const re = new RegExp(`${MARK_OPEN}[\\s\\S]*?${MARK_CLOSE}`);
  let next;
  if (re.test(html)) {
    next = html.replace(re, block);
  } else if (/<\/head>/i.test(html)) {
    next = html.replace(/<\/head>/i, `${block}\n</head>`);
  } else {
    return false;
  }
  if (next !== html) {
    if (!DRY_RUN) writeFileSync(absPath, next);
    return true;
  }
  return false;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(CONFIG_PATH)) die(`missing ${CONFIG_PATH}`);
  const config = readJson(CONFIG_PATH);
  const mapping = readJson(MAPPING_PATH, { documents: {} });
  mapping.documents = mapping.documents || {};

  if (!config.publication?.url || !config.publication?.name) {
    die("standard.config.json needs publication.url and publication.name");
  }

  if (!DRY_RUN && (!HANDLE || !APP_PASSWORD)) {
    die("set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD (use --dry-run to preview without them)");
  }

  let did = mapping.did || null;
  let jwt = null;
  let pds = SERVICE;

  if (!DRY_RUN) {
    log(`→ authenticating as ${HANDLE} via ${SERVICE}`);
    const session = await xrpc(SERVICE, "com.atproto.server.createSession", {
      body: { identifier: HANDLE, password: APP_PASSWORD },
    });
    did = session.did;
    jwt = session.accessJwt;
    pds = await resolvePds(did, session);
    log(`→ did ${did}`);
    log(`→ pds ${pds}`);
  }
  if (!did) did = "did:placeholder"; // dry-run without a prior mapping

  // 1. Publication record (+ optional icon blob, best-effort).
  const pubValue = {
    url: config.publication.url.replace(/\/$/, "") + "/",
    name: config.publication.name,
  };
  if (config.publication.description) pubValue.description = config.publication.description;
  if (config.publication.preferences) pubValue.preferences = config.publication.preferences;

  if (config.publication.icon && !DRY_RUN) {
    const iconPath = join(ROOT, config.publication.icon);
    if (existsSync(iconPath)) {
      try {
        const bytes = readFileSync(iconPath);
        const sha = createHash("sha256").update(bytes).digest("hex");
        if (mapping.icon?.sha === sha && mapping.icon?.blob) {
          pubValue.icon = mapping.icon.blob;
        } else {
          const mime = iconPath.endsWith(".svg")
            ? "image/svg+xml"
            : iconPath.endsWith(".jpg") || iconPath.endsWith(".jpeg")
              ? "image/jpeg"
              : "image/png";
          const up = await xrpc(pds, "com.atproto.repo.uploadBlob", {
            auth: jwt,
            body: new Uint8Array(bytes),
          });
          // uploadBlob ignores Content-Type for the body, but the PDS records
          // the mime from the header we set in xrpc(); set it explicitly here.
          up.blob.mimeType = mime;
          pubValue.icon = up.blob;
          mapping.icon = { sha, blob: up.blob };
        }
      } catch (e) {
        log(`  ! icon upload skipped: ${e.message}`);
      }
    }
  }

  let pub;
  try {
    pub = await ensureRecord(pds, jwt, did, PUB_COLLECTION, mapping.publicationRkey, pubValue);
  } catch (e) {
    // If the icon blob is rejected (e.g. below the 256px minimum), retry without it.
    if (pubValue.icon && /icon|blob|image|InvalidRequest/i.test(e.message)) {
      log(`  ! publication rejected with icon (${e.message}); retrying without icon`);
      delete pubValue.icon;
      delete mapping.icon;
      pub = await ensureRecord(pds, jwt, did, PUB_COLLECTION, mapping.publicationRkey, pubValue);
    } else {
      throw e;
    }
  }
  mapping.did = did;
  mapping.publicationRkey = pub.rkey;
  log(`${pub.changed ? "✓ wrote" : "· unchanged"} publication ${pub.uri}`);

  // 2. .well-known verification file.
  if (!DRY_RUN || !existsSync(WELL_KNOWN_PATH)) {
    if (!DRY_RUN) {
      const wkDir = dirname(WELL_KNOWN_PATH);
      if (!existsSync(wkDir)) execSync(`mkdir -p "${wkDir}"`);
      writeFileSync(WELL_KNOWN_PATH, pub.uri + "\n");
    }
  }
  log(`✓ .well-known/${PUB_COLLECTION} → ${pub.uri}`);

  // 3. Document records + <link> tags.
  const overrides = config.documents?.overrides || {};
  const stripNames = [config.publication.name, ...(config.documents?.titleStrip || [])];
  const docs = expandIncludes(config.documents?.include, [
    ...(config.documents?.exclude || []),
    "404.html",
  ]);
  log(`→ ${docs.length} document(s)`);

  for (const rel of docs) {
    const abs = join(ROOT, rel);
    const html = readFileSync(abs, "utf8");
    const meta = extractMeta(html, stripNames);
    const ov = overrides[rel] || {};
    const value = {
      site: pub.uri,
      title: ov.title || meta.title || rel,
      publishedAt: ov.publishedAt || firstCommitDate(rel) || new Date().toISOString(),
      path: "/" + rel.replace(/^\.?\//, ""),
    };
    const description = ov.description || meta.description;
    if (description) value.description = description;
    if (ov.tags) value.tags = ov.tags;

    const prev = mapping.documents[rel];
    const result = await ensureRecord(pds, jwt, did, DOC_COLLECTION, prev?.rkey, value);
    mapping.documents[rel] = { rkey: result.rkey, uri: result.uri };
    const injected = injectLinkTag(abs, result.uri);
    log(
      `  ${result.changed ? "✓" : "·"} ${rel}${injected ? " (+link)" : ""} → ${result.uri}`
    );
  }

  // 4. Persist the rkey mapping (skip the placeholder DID from dry runs).
  if (!DRY_RUN) {
    writeFileSync(MAPPING_PATH, JSON.stringify(sortKeys(mapping), null, 2) + "\n");
    log(`✓ standard-mapping.json updated`);
  }
  log("✓ standard.site sync complete");
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
