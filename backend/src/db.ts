import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DEFAULT_STOPS } from "./defaults.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
mkdirSync(dataDir, { recursive: true });

/**
 * The store. One file, no server, no connection pool.
 *
 * `node:sqlite` ships with Node 24, so this whole service installs with two
 * dependencies and no native build step — the usual `better-sqlite3` route wants
 * a compiler on the machine, which is a poor trade for a local content store.
 * Node prints an ExperimentalWarning for the module on startup; it is the API
 * surface that is marked experimental, not the durability of the file.
 *
 * Synchronous by design. Every query here is a handful of rows against a local
 * file, and the async version would buy nothing but colour on the functions.
 */
export const db = new DatabaseSync(join(dataDir, "crovion.db"));

// WAL so the admin writing a row cannot block the site reading content, and
// foreign keys because the drops → stops cascade is what makes deleting a stop
// safe. SQLite has FKs off by default and per-connection, which is the usual way
// a schema that looks correct silently is not.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS stops (
    key   TEXT PRIMARY KEY,
    line1 TEXT NOT NULL DEFAULT '',
    line2 TEXT NOT NULL DEFAULT '',
    sort  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drops (
    id       TEXT PRIMARY KEY,
    stop_key TEXT NOT NULL REFERENCES stops(key) ON DELETE CASCADE,
    mark     TEXT NOT NULL,
    label    TEXT NOT NULL,
    detail   TEXT NOT NULL,
    kind     TEXT NOT NULL DEFAULT 'detail',
    sort     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS drops_by_stop ON drops (stop_key, sort);

  CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'site',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    read_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS leads_by_date ON leads (created_at DESC);

  CREATE TABLE IF NOT EXISTS meta (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  );
`);

/**
 * Stamp the content clock.
 *
 * `GET /api/content` returns this, and the site sends it back as an
 * `If-None-Match`, so an unchanged content tree costs a 304 rather than a
 * payload. Every write path calls this — forgetting to is how a stale edit
 * survives on a page that is polling correctly.
 */
export function touchContent(): void {
  db.prepare(
    "INSERT INTO meta (k, v) VALUES ('content_updated_at', ?) " +
      "ON CONFLICT(k) DO UPDATE SET v = excluded.v"
  ).run(new Date().toISOString());
}

export function contentUpdatedAt(): string {
  const row = db
    .prepare("SELECT v FROM meta WHERE k = 'content_updated_at'")
    .get() as { v: string } | undefined;
  return row?.v ?? new Date(0).toISOString();
}

/**
 * First-run seed, and only first-run: it is keyed on the stops table being
 * empty, so restarting the service never overwrites an edit. Wiping and
 * re-seeding is `npm run reset`, which is deliberately a separate, explicit act.
 */
export function seedIfEmpty(): boolean {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM stops").get() as { n: number };
  if (n > 0) return false;

  const insertStop = db.prepare(
    "INSERT INTO stops (key, line1, line2, sort) VALUES (?, ?, ?, ?)"
  );
  const insertDrop = db.prepare(
    "INSERT INTO drops (id, stop_key, mark, label, detail, kind, sort) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  DEFAULT_STOPS.forEach((stop, i) => {
    insertStop.run(stop.key, stop.line1, stop.line2, i);
    stop.drops.forEach((drop, j) => {
      insertDrop.run(drop.id, stop.key, drop.mark, drop.label, drop.detail, drop.kind, j);
    });
  });

  touchContent();
  return true;
}
