import { Router } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { contentUpdatedAt } from "./db.ts";
import {
  addDrop,
  allLeads,
  allStops,
  capacity,
  deleteDrop,
  deleteLead,
  dropsFor,
  markLeadRead,
  moveDrop,
  stop,
  unreadLeadCount,
  updateDrop,
  updateStop,
} from "./store.ts";

export const admin = Router();

// ── Session ──────────────────────────────────────────────────────────────────
//
// One password, one in-memory set of tokens. This service binds to 127.0.0.1 by
// default and the thing being kept out is a browser tab on the same machine, not
// an attacker on the network — so a session table in SQLite would be state to
// maintain in exchange for surviving a restart, which is not a property worth
// paying for here. Restarting the backend logs you out; that is the whole cost.
//
// ⚠️ If this is ever bound to a public interface, this is the first thing to
// replace, along with the default password below.

const PASSWORD = process.env.ADMIN_PASSWORD ?? "crovion";
const SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, number>();

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Constant-time compare, and length-safe: `timingSafeEqual` throws on a mismatch. */
function passwordMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

admin.use((req, res, next) => {
  const token = readCookie(req.headers.cookie, "crovion_admin");
  const expires = token ? sessions.get(token) : undefined;
  if (expires && expires > Date.now()) {
    next();
    return;
  }
  if (token) sessions.delete(token);
  if (req.path === "/login") {
    next();
    return;
  }
  res.redirect("/admin/login");
});

admin.get("/login", (_req, res) => {
  res.send(loginPage());
});

admin.post("/login", (req, res) => {
  const given = String((req.body as Record<string, unknown>)?.password ?? "");
  if (!passwordMatches(given)) {
    res.status(401).send(loginPage("That password is not it."));
    return;
  }
  const token = randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_MS);
  res.cookie("crovion_admin", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: SESSION_MS,
  });
  res.redirect("/admin");
});

admin.post("/logout", (req, res) => {
  const token = readCookie(req.headers.cookie, "crovion_admin");
  if (token) sessions.delete(token);
  res.clearCookie("crovion_admin");
  res.redirect("/admin/login");
});

// ── Content ──────────────────────────────────────────────────────────────────

admin.get("/", (_req, res) => {
  const stops = allStops();
  res.send(
    page(
      "Content",
      `
      <p class="lede">
        Everything here is what the site renders. Edits are live: the page picks
        them up on its next load, and falls back to its built-in copy whenever
        this service is not running.
      </p>

      <div class="grid">
        ${stops
          .map((s) => {
            const drops = dropsFor(s.key);
            const name =
              s.key === "00"
                ? "Head sphere <span class='muted'>(no card)</span>"
                : esc([s.line1, s.line2].filter(Boolean).join(" ")) || "<span class='muted'>Unnamed</span>";
            return `
              <a class="card" href="/admin/stops/${esc(s.key)}">
                <span class="num">${esc(s.key)}</span>
                <span class="name">${name}</span>
                <span class="muted">${drops.length} of ${capacity(s.key)} drops</span>
              </a>`;
          })
          .join("")}
      </div>

      <p class="muted small">Content last changed ${esc(contentUpdatedAt())}</p>
      `
    )
  );
});

admin.get("/stops/:key", (req, res) => {
  const s = stop(req.params.key);
  if (!s) {
    res.status(404).send(page("Not found", `<p>No stop <code>${esc(req.params.key)}</code>.</p>`));
    return;
  }
  const drops = dropsFor(s.key);
  const cap = capacity(s.key);
  const full = drops.length >= cap;
  const error = typeof req.query.error === "string" ? req.query.error : "";

  res.send(
    page(
      `Stop ${s.key}`,
      `
      <p><a class="back" href="/admin">← All stops</a></p>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}

      ${
        s.key === "00"
          ? `<p class="lede">The head sphere carries no number card, so it has no name to
             set — its share control is the OUR SERVICES button on the body itself.
             Its drops are below.</p>`
          : `<form method="post" action="/admin/stops/${esc(s.key)}" class="panel">
              <h2>Name on the card</h2>
              <p class="muted small">Two lines, set in caps by the site. Leave the second empty for a one-line name.</p>
              <div class="row">
                <label>Line 1<input name="line1" value="${esc(s.line1)}" maxlength="24"></label>
                <label>Line 2<input name="line2" value="${esc(s.line2)}" maxlength="24"></label>
              </div>
              <button type="submit">Save name</button>
            </form>`
      }

      <h2>Drops <span class="muted">${drops.length} of ${cap}</span></h2>
      <p class="muted small">
        Order is position: each drop takes the next place on this sphere's
        hand-placed arc, so moving one up or down moves it on screen. Positions
        themselves are not editable — they are collision-checked against the
        neighbouring spheres in the site's code.
      </p>

      ${drops.map((d, i) => dropForm(d, i, drops.length)).join("")}

      ${
        full
          ? `<p class="muted small">All ${cap} positions on this arc are used. Delete one to add another.</p>`
          : `<form method="post" action="/admin/stops/${esc(s.key)}/drops" class="panel new">
              <h2>Add a drop</h2>
              <div class="row">
                <label class="mark">Mark<input name="mark" maxlength="3" placeholder="ABC" required></label>
                <label>Name<input name="label" maxlength="60" placeholder="What it is called" required></label>
              </div>
              <label>Detail<textarea name="detail" rows="2" maxlength="200" placeholder="The one line its share button reveals."></textarea></label>
              <button type="submit">Add</button>
            </form>`
      }
      `
    )
  );
});

admin.post("/stops/:key", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  updateStop(
    req.params.key,
    String(body.line1 ?? "").trim().slice(0, 24),
    String(body.line2 ?? "").trim().slice(0, 24)
  );
  res.redirect(`/admin/stops/${encodeURIComponent(req.params.key)}`);
});

admin.post("/stops/:key/drops", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = addDrop(req.params.key, {
    mark: String(body.mark ?? "").trim().slice(0, 3).toUpperCase(),
    label: String(body.label ?? "").trim().slice(0, 60),
    detail: String(body.detail ?? "").trim().slice(0, 200),
    kind: "detail",
  });
  const url = `/admin/stops/${encodeURIComponent(req.params.key)}`;
  res.redirect(result.ok ? url : `${url}?error=${encodeURIComponent(result.error)}`);
});

admin.post("/drops/:id", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  updateDrop(req.params.id, {
    mark: String(body.mark ?? "").trim().slice(0, 3).toUpperCase(),
    label: String(body.label ?? "").trim().slice(0, 60),
    detail: String(body.detail ?? "").trim().slice(0, 200),
    kind: body.kind === "form" ? "form" : "detail",
  });
  res.redirect(`/admin/stops/${encodeURIComponent(String(body.stop ?? ""))}`);
});

admin.post("/drops/:id/delete", (req, res) => {
  const stopKey = String((req.body as Record<string, unknown>)?.stop ?? "");
  deleteDrop(req.params.id);
  res.redirect(`/admin/stops/${encodeURIComponent(stopKey)}`);
});

admin.post("/drops/:id/move", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  moveDrop(req.params.id, body.direction === "up" ? "up" : "down");
  res.redirect(`/admin/stops/${encodeURIComponent(String(body.stop ?? ""))}`);
});

// ── Leads ────────────────────────────────────────────────────────────────────

admin.get("/leads", (_req, res) => {
  const leads = allLeads();
  res.send(
    page(
      "Leads",
      `
      <p><a class="back" href="/admin">← Content</a></p>
      <p class="lede">
        ${leads.length} submission${leads.length === 1 ? "" : "s"}, newest first.
        <a href="/admin/leads.csv">Download CSV</a>
      </p>
      ${
        leads.length === 0
          ? `<p class="muted">Nothing yet. The form on the site's CONTACT US sphere writes here.</p>`
          : leads.map(leadCard).join("")
      }
      `
    )
  );
});

admin.post("/leads/:id/read", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  markLeadRead(Number(req.params.id), body.read === "1");
  res.redirect("/admin/leads");
});

admin.post("/leads/:id/delete", (req, res) => {
  deleteLead(Number(req.params.id));
  res.redirect("/admin/leads");
});

/**
 * CSV, quoted per RFC 4180 — every field wrapped and every embedded quote
 * doubled, unconditionally. Quoting only the fields that "need" it is how a
 * message containing a comma silently becomes two columns in a spreadsheet.
 */
admin.get("/leads.csv", (_req, res) => {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["id", "created_at", "name", "email", "phone", "message", "source", "read_at"].join(","),
    ...allLeads().map((l) =>
      [l.id, l.created_at, l.name, l.email, l.phone, l.message, l.source, l.read_at ?? ""]
        .map(cell)
        .join(",")
    ),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="crovion-leads.csv"');
  res.send(rows.join("\r\n"));
});

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * Escape *everything* interpolated into the HTML below.
 *
 * Every string on these pages is either something someone typed into the admin
 * or something a stranger typed into the contact form on the public site. The
 * lead inbox in particular renders attacker-controlled text straight into a
 * privileged page, which is the exact shape of a stored XSS — so this is applied
 * at every interpolation without asking whether a given field "could" contain
 * markup.
 */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dropForm(
  d: { id: string; stop_key: string; mark: string; label: string; detail: string; kind: string },
  index: number,
  total: number
): string {
  return `
    <div class="panel drop">
      <form method="post" action="/admin/drops/${esc(d.id)}">
        <input type="hidden" name="stop" value="${esc(d.stop_key)}">
        <div class="row">
          <label class="mark">Mark<input name="mark" value="${esc(d.mark)}" maxlength="3" required></label>
          <label>Name<input name="label" value="${esc(d.label)}" maxlength="60" required></label>
          <span class="slot">slot ${index + 1}</span>
        </div>
        <label>Detail<textarea name="detail" rows="2" maxlength="200">${esc(d.detail)}</textarea></label>
        <label class="check">
          <input type="checkbox" name="kind" value="form" ${d.kind === "form" ? "checked" : ""}>
          Opens the contact form instead of showing the detail line
        </label>
        <div class="actions">
          <button type="submit">Save</button>
        </div>
      </form>
      <div class="side">
        <form method="post" action="/admin/drops/${esc(d.id)}/move">
          <input type="hidden" name="stop" value="${esc(d.stop_key)}">
          <input type="hidden" name="direction" value="up">
          <button type="submit" class="ghost" ${index === 0 ? "disabled" : ""} title="Move up">↑</button>
        </form>
        <form method="post" action="/admin/drops/${esc(d.id)}/move">
          <input type="hidden" name="stop" value="${esc(d.stop_key)}">
          <input type="hidden" name="direction" value="down">
          <button type="submit" class="ghost" ${index === total - 1 ? "disabled" : ""} title="Move down">↓</button>
        </form>
        <form method="post" action="/admin/drops/${esc(d.id)}/delete">
          <input type="hidden" name="stop" value="${esc(d.stop_key)}">
          <button type="submit" class="ghost danger" title="Delete">✕</button>
        </form>
      </div>
    </div>`;
}

function leadCard(l: {
  id: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  created_at: string;
  read_at: string | null;
}): string {
  return `
    <div class="panel lead ${l.read_at ? "read" : "unread"}">
      <div class="lead-head">
        <strong>${esc(l.name)}</strong>
        <a href="mailto:${esc(l.email)}">${esc(l.email)}</a>
        ${l.phone ? `<span class="muted">${esc(l.phone)}</span>` : ""}
        <span class="muted small">${esc(l.created_at)}</span>
        ${l.read_at ? "" : '<span class="dot" title="Unread"></span>'}
      </div>
      <p class="message">${esc(l.message)}</p>
      <div class="side">
        <form method="post" action="/admin/leads/${l.id}/read">
          <input type="hidden" name="read" value="${l.read_at ? "0" : "1"}">
          <button type="submit" class="ghost">${l.read_at ? "Mark unread" : "Mark read"}</button>
        </form>
        <form method="post" action="/admin/leads/${l.id}/delete">
          <button type="submit" class="ghost danger">Delete</button>
        </form>
      </div>
    </div>`;
}

function shell(title: string, body: string, nav: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Crovion</title>
<style>
  :root { --ink:#14131A; --ground:#F5F3F2; --panel:#FFFFFF; --line:rgba(20,19,26,.10); --accent:#9A6BEE; --danger:#D6455F; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--ground); color:var(--ink);
         font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  header { display:flex; align-items:baseline; gap:24px; padding:22px 32px; border-bottom:1px solid var(--line); }
  header h1 { font-size:15px; letter-spacing:.22em; text-transform:uppercase; margin:0; font-weight:600 }
  header nav { display:flex; gap:18px; margin-left:auto }
  header a, .back { color:var(--ink); text-decoration:none; opacity:.65 }
  header a:hover, .back:hover { opacity:1 }
  header a.on { opacity:1; box-shadow:0 2px 0 var(--accent) }
  main { max-width:820px; margin:0 auto; padding:32px 24px 96px }
  h2 { font-size:13px; letter-spacing:.14em; text-transform:uppercase; margin:32px 0 8px; font-weight:600 }
  .lede { color:rgba(20,19,26,.75); max-width:60ch }
  .muted { color:rgba(20,19,26,.55) }
  .small { font-size:12px }
  .error { background:#FDE8EC; border:1px solid #F3B9C5; color:#8C1F35; padding:10px 14px; border-radius:8px }
  .grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)) }
  .card { display:flex; flex-direction:column; gap:4px; background:var(--panel); border:1px solid var(--line);
          border-radius:12px; padding:18px; text-decoration:none; color:var(--ink) }
  .card:hover { border-color:var(--accent) }
  .card .num { font-size:11px; letter-spacing:.2em; color:var(--accent) }
  .card .name { font-size:18px }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:18px; margin:12px 0;
           display:flex; gap:16px; align-items:flex-start }
  .panel > form:first-child { flex:1; min-width:0 }
  form.panel { display:block }
  .row { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap }
  label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:rgba(20,19,26,.6); flex:1; min-width:120px; margin-bottom:10px }
  label.mark { flex:0 0 90px; min-width:90px }
  label.check { flex-direction:row; align-items:center; gap:8px }
  input, textarea { font:inherit; color:var(--ink); background:var(--ground); border:1px solid var(--line);
                    border-radius:8px; padding:9px 11px; width:100%; resize:vertical }
  input:focus, textarea:focus { outline:2px solid var(--accent); outline-offset:1px }
  input[type=checkbox] { width:auto }
  button { font:inherit; cursor:pointer; border:0; border-radius:999px; padding:9px 18px;
           background:var(--ink); color:#fff }
  button:hover { opacity:.85 }
  button.ghost { background:transparent; color:rgba(20,19,26,.6); border:1px solid var(--line); padding:6px 12px }
  button.ghost:hover { color:var(--ink); border-color:var(--ink) }
  button.danger:hover { color:var(--danger); border-color:var(--danger) }
  button:disabled { opacity:.3; cursor:default }
  .side { display:flex; flex-direction:column; gap:6px; align-items:stretch }
  .slot { font-size:11px; color:rgba(20,19,26,.45); padding-bottom:12px }
  .lead { flex-direction:column }
  .lead.unread { border-left:3px solid var(--accent) }
  .lead-head { display:flex; gap:12px; align-items:baseline; flex-wrap:wrap }
  .lead .message { white-space:pre-wrap; margin:10px 0 0 }
  .lead .side { flex-direction:row }
  .dot { width:7px; height:7px; border-radius:50%; background:var(--accent) }
  .login { max-width:340px; margin:14vh auto }
</style>
</head><body>
<header>
  <h1>Crovion</h1>
  <nav>${nav}</nav>
</header>
<main>${body}</main>
</body></html>`;
}

function page(title: string, body: string): string {
  const unread = unreadLeadCount();
  const nav = `
    <a href="/admin"${title === "Content" ? ' class="on"' : ""}>Content</a>
    <a href="/admin/leads"${title === "Leads" ? ' class="on"' : ""}>Leads${unread ? ` (${unread})` : ""}</a>
    <form method="post" action="/admin/logout" style="display:inline">
      <button type="submit" class="ghost">Log out</button>
    </form>`;
  return shell(title, `<h2 style="margin-top:0">${esc(title)}</h2>${body}`, nav);
}

function loginPage(error = ""): string {
  return shell(
    "Log in",
    `<form method="post" action="/admin/login" class="panel login">
       <h2 style="margin-top:0">Log in</h2>
       ${error ? `<p class="error">${esc(error)}</p>` : ""}
       <label>Password<input type="password" name="password" autofocus required></label>
       <button type="submit">Enter</button>
     </form>`,
    ""
  );
}
