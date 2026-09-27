/**
 * Where the content service lives.
 *
 * 4100 rather than 4000, which is already occupied on this machine. Set
 * `NEXT_PUBLIC_BACKEND_URL` in `.env.local` to point somewhere else — it has to
 * carry the `NEXT_PUBLIC_` prefix because the fetch happens in the browser, not
 * on the server.
 *
 * An empty string is treated as "no backend" and skips the fetch entirely, which
 * is the switch to throw for a build that should ship the built-in copy and
 * never reach for a service that will not be there.
 *
 * The localhost default is for `next dev` only. A production build with the
 * variable unset used to inherit it too, which put `http://localhost:4100` into
 * the static bundle — every visitor's browser then reached for a service on
 * their own machine, and recent browsers answer a public page doing that with a
 * local-network permission prompt. So an unset variable now means "no backend"
 * in production, and connecting one is an explicit act:
 * `NEXT_PUBLIC_BACKEND_URL=https://api.example.com npm run build`.
 */
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:4100" : "");
