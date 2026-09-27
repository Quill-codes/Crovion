/**
 * The Crovion backend.
 *
 * A separate process on a separate port from the Next site, on purpose: the site
 * is a heavy WebGL front end that is rebuilt whenever a shader changes, and its
 * content should not be. Running them apart means the copy can be edited while
 * the site is untouched, and the site keeps rendering its built-in fallback when
 * this is not running at all.
 *
 *   npm install        (once)
 *   npm run dev        → http://localhost:4100
 *
 * 4100 rather than the obvious 4000, which is already taken on this machine by
 * the marketplace API. Override with PORT if it ever collides with something
 * else.
 *
 *   /admin             the panel — content and the leads inbox
 *   /api/content       what the site reads
 *   /api/leads         what the site's contact form writes
 *
 * ⚠️ Binds to 127.0.0.1 by default and the admin password defaults to "crovion".
 * Both are fine on your own machine and are the two things to change before this
 * is reachable from anywhere else — see HOST and ADMIN_PASSWORD below.
 */
import express from "express";
import cors from "cors";
import { seedIfEmpty } from "./db.ts";
import { api } from "./api.ts";
import { admin } from "./admin.ts";

const PORT = Number(process.env.PORT ?? 4100);
const HOST = process.env.HOST ?? "127.0.0.1";

/**
 * Who may call the API from a browser.
 *
 * An allowlist rather than `*`, because the admin's session cookie lives on this
 * origin: a wildcard plus credentials is the combination that lets any page on
 * the internet drive a logged-in admin session. The two dev ports Next uses are
 * seeded; add to it with CORS_ORIGINS as a comma-separated list.
 */
const ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();

// Behind nothing by default, but `req.ip` is what the lead throttle keys on, so
// this has to be right if a proxy is ever put in front of it.
app.set("trust proxy", process.env.TRUST_PROXY === "1");

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

app.use("/api", cors({ origin: ORIGINS }), api);
app.use("/admin", admin);

app.get("/", (_req, res) => res.redirect("/admin"));

// Last, and four arguments so Express recognises it as an error handler. Without
// it a throw inside a route handler prints a stack trace to the response, which
// on the admin means leaking absolute paths to whoever tripped it.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[crovion]", err);
    if (res.headersSent) return;
    res.status(500).json({ ok: false, error: "Something went wrong on the server." });
  }
);

if (seedIfEmpty()) {
  console.log("[crovion] fresh database — seeded from defaults.ts");
}

app.listen(PORT, HOST, () => {
  console.log(`[crovion] backend on http://${HOST}:${PORT}`);
  console.log(`[crovion] admin    http://${HOST}:${PORT}/admin`);
  console.log(`[crovion] allowing origins: ${ORIGINS.join(", ")}`);
});
