# Crovion backend

A small content + leads service for the Crovion site. It runs as its own process
on its own port, and the site works with or without it.

```
npm install       # once
npm run dev       # http://localhost:4100  (--watch; restarts on save)
npm start         # same, without the watcher
npm run reset     # wipe the database and re-seed from src/defaults.ts
```

| | |
|---|---|
| `/admin` | the panel — sphere copy, and the leads inbox |
| `/api/content` | what the site reads |
| `/api/leads` | what the site's contact form writes |
| `/api/health` | liveness, plus the content clock |

Default password: **`crovion`**. Set `ADMIN_PASSWORD` to change it.

## Why it is a separate process

The site is a WebGL page that is rebuilt whenever a shader changes; its copy
should not be. Running them apart means the words can be edited without touching
the site, and — the part that matters more — the site still builds and deploys
with no service behind it at all.

That is not a graceful-degradation story bolted on afterwards. The site ships
with its whole content tree hardcoded (`lib/satellites.ts`, and the chain table
in `components/HeroCanvas.tsx`), and **that is what renders** until this service
answers. Backend down, unreachable, or returning something malformed all land in
the same place: the built-in copy, with nothing on screen to say so. The one
exception is the contact form, which says plainly when a submission did not send
— a form that swallows a lead is worse than a form that is not there.

## What is editable, and what is not

Editable: each stop's two-line card name, and its drops — mark, name, detail,
order, and which one opens the contact form.

Not editable, and deliberately: **geometry**. Every drop's offset and radius, the
chain's world positions, and the tints all stay in the site's code. Those values
are collision-checked against their neighbours, and 03's tint is pre-compensated
for the composite's tone mapping. None of that survives a text field.

So the two halves meet by index: drop 0 in the API's array takes slot 0 on that
parent's hand-placed arc. **Array order is placement on screen**, which is why
the admin's only positioning control is a pair of reorder arrows, and why each
stop has a fixed number of slots (five on the head sphere, four on the numbered
stops). The admin refuses to add past the cap; the site independently drops any
extras it is handed, which is the check that holds when the two processes are
different versions of themselves.

## Storage

SQLite, via `node:sqlite` — built into Node 24, so there is no native build step
and no compiler needed. Node prints an `ExperimentalWarning` for the module at
startup; that is the API surface being marked experimental, not the file.

The database lives at `data/crovion.db` and is gitignored. It seeds itself from
`src/defaults.ts` on first run only — restarting never overwrites an edit.

## Before this is reachable from anywhere but your machine

It binds to `127.0.0.1` and its admin password defaults to `crovion`, which is
the right shape for a local tool and the wrong shape for anything else. If it is
ever exposed:

1. Set `ADMIN_PASSWORD` to something real.
2. Replace the in-memory session set in `src/admin.ts`, and add CSRF tokens — the
   admin currently relies on a `SameSite=Strict` cookie for that.
3. Replace the in-memory per-IP throttle in `src/api.ts`; a `Map` in one process
   cannot stop a distributed flood.
4. Set `CORS_ORIGINS` to the real site origin, and `TRUST_PROXY=1` if there is a
   proxy in front (the throttle keys on `req.ip`).

## Environment

| variable | default | |
|---|---|---|
| `PORT` | `4100` | 4000 is already taken on this machine |
| `HOST` | `127.0.0.1` | |
| `ADMIN_PASSWORD` | `crovion` | |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | comma-separated |
| `TRUST_PROXY` | off | `1` to honour `X-Forwarded-For` |

The site finds this service through `NEXT_PUBLIC_BACKEND_URL` (set it in the
site's `.env.local`; it defaults to `http://localhost:4100`). Setting it to an
empty string turns the fetch off entirely — the switch to throw for a build that
should ship the built-in copy and never reach for a service that will not be
there.
