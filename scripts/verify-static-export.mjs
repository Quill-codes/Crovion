/**
 * Check `out/` is a complete, self-contained static site before it is uploaded.
 *
 *   npm run verify:static        (also runs at the end of `npm run build:static`)
 *
 * The route list is not written out here. It is read from the prerender
 * manifest of the build that produced `out/`, so a detail page added to
 * `lib/pages/registry.ts` is a page this checks, with no second list to forget.
 *
 * Fails (exit 1) on: a prerendered route with no file in `out/`, a missing
 * index / 404 / .htaccess, no JS or CSS, no WebGL code in the bundle, or any
 * reference to a local-machine backend. `/api/` paths are reported but do not
 * fail — they are the backend calls, and whether they are live depends on
 * `NEXT_PUBLIC_BACKEND_URL` at build time; see the note printed with them.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const out = join(root, "out");
const manifestPath = join(root, ".next", "prerender-manifest.json");

const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(out)) {
  console.error("✗ out/ does not exist. Run `npm run build:static` first.");
  process.exit(1);
}

// ── Files ────────────────────────────────────────────────────────────────────

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(out);
const rel = (p) => relative(out, p);

// ── Routes ───────────────────────────────────────────────────────────────────

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const routes = Object.keys(manifest.routes)
  // Next's internal error boundaries; `/_not-found` is emitted as 404.html.
  .filter((r) => !r.startsWith("/_"))
  .sort();

const pages = [];
for (const route of routes) {
  const isFile = extname(route) !== "";
  const target = isFile
    ? join(out, route)
    : join(out, route === "/" ? "" : route, "index.html");
  if (!existsSync(target)) fail(`route ${route} has no ${rel(target)}`);
  if (!isFile) pages.push(route);
}

for (const required of ["index.html", "404.html", ".htaccess"]) {
  if (!existsSync(join(out, required))) fail(`missing ${required}`);
}

for (const section of ["services", "about", "work", "contact"]) {
  if (!pages.some((r) => r.startsWith(`/${section}/`))) {
    fail(`no pages generated under /${section}/`);
  }
}
for (const page of ["/", "/privacy", "/terms"]) {
  if (!pages.includes(page)) fail(`page ${page} was not prerendered`);
}

// ── Assets ───────────────────────────────────────────────────────────────────

const js = files.filter((f) => f.endsWith(".js"));
const css = files.filter((f) => f.endsWith(".css"));
if (js.length === 0) fail("no JavaScript in out/");
if (css.length === 0) fail("no CSS in out/");
const stray = [...js, ...css].filter((f) => !rel(f).startsWith("_next/static/"));
if (stray.length) fail(`JS/CSS outside _next/static/ (not cache-safe): ${stray.map(rel).join(", ")}`);

// Markers that survive minification: three's renderer class and GLSL entry
// points. If these are absent the WebGL scene did not make it into the bundle.
const bundle = js.map((f) => readFileSync(f, "utf8")).join("\n");
const webgl = {
  "three WebGLRenderer": /WebGLRenderer/,
  "GLSL fragment shaders": /gl_FragColor|out\s+(?:highp\s+|mediump\s+)?vec4/,
  "GLSL vertex shaders": /gl_Position/,
  "React Three Fiber canvas": /\bR3F\b|__r3f/,
};
for (const [name, re] of Object.entries(webgl)) {
  if (!re.test(bundle)) fail(`bundle has no trace of ${name}`);
}

// ── References that must not ship ────────────────────────────────────────────

const textExt = new Set([".html", ".js", ".css", ".txt", ".json", ".svg", ".map"]);
const texts = files.filter((f) => textExt.has(extname(f)));

function scan(re) {
  const hits = [];
  for (const f of texts) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re)) {
      const at = m.index ?? 0;
      const ctx = src.slice(Math.max(0, at - 60), at + m[0].length + 40).replace(/\s+/g, " ");
      hits.push({ file: rel(f), ctx });
    }
  }
  return hits;
}

// A URL on the visitor's own machine is the failure. The bare words are only
// reported: bundled libraries mention them — Next's legacy-browser polyfill
// chunk (core-js, loaded via <script nomodule>) has a URL parser that compares
// a file: URL's host against "localhost" — and failing on that would fail every
// build for nothing.
const localUrls = scan(/(?:https?:)?\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/g);
for (const h of localUrls) fail(`local URL in ${h.file}: …${h.ctx}…`);

const mentions = {
  localhost: scan(/localhost/g),
  "127.0.0.1": scan(/127\.0\.0\.1/g),
  NEXT_PUBLIC_BACKEND_URL: scan(/NEXT_PUBLIC_BACKEND_URL/g),
};
// The backend's two endpoints, as the site calls them. With the URL empty at
// build time the calls are dead code (`if (!BACKEND_URL) return` on a constant)
// and the bundler drops them, so zero is the expected count for a static build.
const backendCalls = scan(/\/api\/(?:content|leads)\b/g);
const otherApi = scan(/\/api\/[a-z]+/g).filter(
  (h) => !/\/api\/(?:content|leads)\b/.test(h.ctx)
);

// ── Report ───────────────────────────────────────────────────────────────────

const size = files.reduce((n, f) => n + statSync(f).size, 0);
console.log(`out/: ${files.length} files, ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log(`pages (${pages.length}):`);
for (const p of pages) console.log(`  ${p === "/" ? "/" : `${p}/`}`);
console.log(`JS ${js.length} · CSS ${css.length} · WebGL markers ${Object.keys(webgl).length}/${Object.keys(webgl).length}`);

console.log(`\nlocal backend URLs: ${localUrls.length}`);
for (const [name, hits] of Object.entries(mentions)) {
  console.log(`"${name}" mentions: ${hits.length}`);
  for (const h of hits) console.log(`  ${h.file}: …${h.ctx}…`);
}
if (mentions.NEXT_PUBLIC_BACKEND_URL.length) {
  console.log(
    "  The variable was unset at build time, so it was left as a runtime lookup\n" +
      "  instead of being inlined. In a browser that lookup is undefined and the\n" +
      "  site runs with no backend — safe, but build with `npm run build:static`\n" +
      "  (which sets it to empty) or with a real URL to have it inlined."
  );
}

console.log(`\nbackend calls (/api/content, /api/leads): ${backendCalls.length}`);
for (const h of backendCalls) console.log(`  ${h.file}: …${h.ctx}…`);
console.log(
  backendCalls.length
    ? "  Built against a backend: these requests go to NEXT_PUBLIC_BACKEND_URL."
    : "  None — built with no backend, so the calls were compiled out. The site\n" +
        "  renders its built-in copy and the form points visitors at the email."
);
console.log(`other /api/ strings: ${otherApi.length}`);
for (const h of otherApi) console.log(`  ${h.file}: …${h.ctx}…`);

if (failures.length) {
  console.error(`\n✗ ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\n✓ out/ is ready to upload into public_html/");
