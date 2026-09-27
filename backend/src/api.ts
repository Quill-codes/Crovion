import { Router } from "express";
import { contentUpdatedAt } from "./db.ts";
import { contentTree, insertLead } from "./store.ts";

export const api = Router();

/**
 * The content tree the site renders from.
 *
 * ETagged on the content clock rather than on the body, because the clock is
 * already maintained by every write path and hashing the payload on every poll
 * would be work done to discover what a timestamp comparison already knows.
 *
 * `no-cache` rather than `no-store`: the response *is* cacheable, it just has to
 * be revalidated. That is the difference between a poll costing a 304 and a poll
 * costing the whole tree.
 */
api.get("/content", (req, res) => {
  const etag = `W/"${contentUpdatedAt()}"`;
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.json({ updatedAt: contentUpdatedAt(), stops: contentTree() });
});

/**
 * Per-IP throttle for the lead endpoint.
 *
 * In memory, so it resets with the process, and that is the right size for it:
 * this is a local service behind a form on one page, and the thing being
 * defended against is a stuck retry loop or someone leaning on the send button —
 * not a distributed flood, which a Map in a single process could not stop
 * anyway. If this service is ever exposed to the internet, replace it; do not
 * tune it.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * A lead from the site's contact form.
 *
 * Everything is clipped rather than rejected on length: a message that runs long
 * is still a lead, and losing it to a validation error to protect a TEXT column
 * that has no length limit anyway would be the wrong trade. Only the two fields
 * that have to be *usable* — a name to reply to and an address to reply at — are
 * hard requirements.
 */
api.post("/leads", (req, res) => {
  const ip = req.ip ?? "unknown";
  if (rateLimited(ip)) {
    res.status(429).json({ ok: false, error: "Too many submissions. Try again in a minute." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // Honeypot. A field named `company` that is hidden in the markup and that no
  // human ever fills; anything that arrives with it filled is answered 200 on
  // purpose, so a bot gets no signal about what tripped it.
  if (clip(body.company, 200) !== "") {
    res.status(200).json({ ok: true });
    return;
  }

  const name = clip(body.name, 120);
  const email = clip(body.email, 200);
  const phone = clip(body.phone, 60);
  const message = clip(body.message, 4000);

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Required";
  if (!email) errors.email = "Required";
  else if (!isEmail(email)) errors.email = "Doesn't look like an email address";
  if (!message) errors.message = "Required";

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ ok: false, errors });
    return;
  }

  const id = insertLead({
    name,
    email,
    phone,
    message,
    source: clip(body.source, 60) || "site",
    userAgent: clip(req.headers["user-agent"], 400),
  });

  res.status(201).json({ ok: true, id });
});

api.get("/health", (_req, res) => {
  res.json({ ok: true, updatedAt: contentUpdatedAt() });
});
