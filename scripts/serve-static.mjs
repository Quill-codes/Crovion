/**
 * Serve `out/` the way shared hosting will, to check the export before upload.
 *
 *   npm run preview:static       → http://localhost:4173
 *
 * `next start` does not serve a static export, and `next dev` is not the thing
 * being uploaded. This behaves like Apache/LiteSpeed with the site's .htaccess:
 * a directory without its trailing slash is 301-redirected to it, a directory
 * serves its index.html, anything else missing is the site's 404.html with a 404
 * status, and there is nothing behind /api/ — exactly the state of the first,
 * frontend-only deployment.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(fileURLToPath(import.meta.url), "..", "..", "out");
const port = Number(process.env.PORT ?? 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

if (!existsSync(out)) {
  console.error("out/ does not exist. Run `npm run build:static` first.");
  process.exit(1);
}

function send(res, status, file) {
  res.writeHead(status, {
    "Content-Type": types[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  // normalize() resolves `..`; anything that still escapes out/ is refused.
  const file = normalize(join(out, path));
  // Apache refuses .htaccess / .htpasswd to clients; so does this.
  if ((file !== out && !file.startsWith(out + sep)) || /\/\.ht/.test(path)) {
    res.writeHead(403).end();
    return;
  }

  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith("/")) {
      res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
      return;
    }
    const index = join(file, "index.html");
    if (existsSync(index)) return send(res, 200, index);
  } else if (existsSync(file)) {
    return send(res, 200, file);
  }
  send(res, 404, join(out, "404.html"));
}).listen(port, () => {
  console.log(`Serving out/ at http://localhost:${port} (static host, no backend)`);
});
