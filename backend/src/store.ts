import { db, touchContent } from "./db.ts";
import { SLOT_CAP } from "./defaults.ts";

export interface DropRow {
  id: string;
  stop_key: string;
  mark: string;
  label: string;
  detail: string;
  kind: string;
  sort: number;
}

export interface StopRow {
  key: string;
  line1: string;
  line2: string;
  sort: number;
}

export interface LeadRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  user_agent: string;
  created_at: string;
  read_at: string | null;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function allStops(): StopRow[] {
  return db.prepare("SELECT * FROM stops ORDER BY sort").all() as unknown as StopRow[];
}

export function stop(key: string): StopRow | undefined {
  return db.prepare("SELECT * FROM stops WHERE key = ?").get(key) as
    | unknown
    | undefined as StopRow | undefined;
}

export function dropsFor(key: string): DropRow[] {
  return db
    .prepare("SELECT * FROM drops WHERE stop_key = ? ORDER BY sort")
    .all(key) as unknown as DropRow[];
}

export function drop(id: string): DropRow | undefined {
  return db.prepare("SELECT * FROM drops WHERE id = ?").get(id) as
    | unknown
    | undefined as DropRow | undefined;
}

export function capacity(key: string): number {
  return SLOT_CAP[key] ?? 4;
}

/**
 * The payload the site renders from.
 *
 * Shaped as the site's own tables are, not as the database is: `key` → the stop,
 * `drops` in arc order. The site zips this against its hardcoded geometry by
 * index, so array order here *is* placement on screen.
 */
export function contentTree() {
  return allStops().map((s) => ({
    key: s.key,
    line1: s.line1,
    line2: s.line2,
    drops: dropsFor(s.key).map((d) => ({
      id: d.id,
      mark: d.mark,
      label: d.label,
      detail: d.detail,
      kind: d.kind === "form" ? "form" : "detail",
    })),
  }));
}

// ── Writes ───────────────────────────────────────────────────────────────────

export function updateStop(key: string, line1: string, line2: string): void {
  db.prepare("UPDATE stops SET line1 = ?, line2 = ? WHERE key = ?").run(line1, line2, key);
  touchContent();
}

export function updateDrop(
  id: string,
  fields: { mark: string; label: string; detail: string; kind: string }
): void {
  db.prepare("UPDATE drops SET mark = ?, label = ?, detail = ?, kind = ? WHERE id = ?").run(
    fields.mark,
    fields.label,
    fields.detail,
    fields.kind === "form" ? "form" : "detail",
    id
  );
  touchContent();
}

/**
 * Add a drop to the end of a parent's arc.
 *
 * Refuses past `capacity`, and that refusal is the whole reason the cap exists in
 * code rather than as a comment: the site has a fixed, hand-placed offset per
 * slot, so an extra drop has nowhere to be and lands on top of the last one.
 */
export function addDrop(
  stopKey: string,
  fields: { mark: string; label: string; detail: string; kind: string }
): { ok: true; id: string } | { ok: false; error: string } {
  const existing = dropsFor(stopKey);
  const cap = capacity(stopKey);
  if (existing.length >= cap) {
    return {
      ok: false,
      error: `Stop ${stopKey} has ${cap} placed positions and all ${cap} are used. Delete one first.`,
    };
  }

  // Ids are stable and human-readable because they are what the site keys its
  // React elements off — a drop that keeps its id keeps its animation state
  // across an edit instead of remounting mid-fan.
  const base = `${stopKey}-${(fields.mark || "new").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  let id = base;
  let n = 2;
  while (drop(id)) id = `${base}${n++}`;

  db.prepare(
    "INSERT INTO drops (id, stop_key, mark, label, detail, kind, sort) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    stopKey,
    fields.mark,
    fields.label,
    fields.detail,
    fields.kind === "form" ? "form" : "detail",
    existing.length
  );
  touchContent();
  return { ok: true, id };
}

export function deleteDrop(id: string): void {
  const d = drop(id);
  if (!d) return;
  db.prepare("DELETE FROM drops WHERE id = ?").run(id);
  resequence(d.stop_key);
  touchContent();
}

/** Move a drop one position along its parent's arc. */
export function moveDrop(id: string, direction: "up" | "down"): void {
  const d = drop(id);
  if (!d) return;
  const siblings = dropsFor(d.stop_key);
  const i = siblings.findIndex((s) => s.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return;

  const update = db.prepare("UPDATE drops SET sort = ? WHERE id = ?");
  update.run(j, siblings[i].id);
  update.run(i, siblings[j].id);
  touchContent();
}

/** Close the gaps `sort` leaves behind after a delete. */
function resequence(stopKey: string): void {
  const update = db.prepare("UPDATE drops SET sort = ? WHERE id = ?");
  dropsFor(stopKey).forEach((d, i) => update.run(i, d.id));
}

// ── Leads ────────────────────────────────────────────────────────────────────

export function insertLead(fields: {
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  userAgent: string;
}): number {
  const res = db
    .prepare(
      "INSERT INTO leads (name, email, phone, message, source, user_agent, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      fields.name,
      fields.email,
      fields.phone,
      fields.message,
      fields.source,
      fields.userAgent,
      new Date().toISOString()
    );
  return Number(res.lastInsertRowid);
}

export function allLeads(): LeadRow[] {
  return db
    .prepare("SELECT * FROM leads ORDER BY created_at DESC, id DESC")
    .all() as unknown as LeadRow[];
}

export function unreadLeadCount(): number {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE read_at IS NULL").get() as {
    n: number;
  };
  return n;
}

export function markLeadRead(id: number, read: boolean): void {
  db.prepare("UPDATE leads SET read_at = ? WHERE id = ?").run(
    read ? new Date().toISOString() : null,
    id
  );
}

export function deleteLead(id: number): void {
  db.prepare("DELETE FROM leads WHERE id = ?").run(id);
}
