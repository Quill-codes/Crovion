import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // A static site, for shared hosting that serves files and runs nothing:
  // `next build` writes the whole site to `out/`, which is uploaded as-is into
  // `public_html/`. Nothing here needs a server — the one dynamic route closes
  // its parameter space with `generateStaticParams` + `dynamicParams = false`,
  // and the content backend is reached from the browser, not from Next. The
  // cost is that `next start` no longer serves the build; preview `out/` with
  // `npm run preview:static` instead.
  output: "export",
  // `/privacy` → `out/privacy/index.html` rather than `out/privacy.html`. Apache
  // and LiteSpeed resolve a directory to its index.html with no rewrite rules,
  // and redirect the slashless URL to the slashed one on their own.
  trailingSlash: true,
  transpilePackages: ["three"],
  turbopack: {
    // Pinned, not inferred. `backend/` is a separate package with its own
    // lockfile, and Turbopack infers the workspace root by walking up from the
    // lockfiles it finds — with two in the tree it warns on every start and its
    // choice is a guess. This directory is the answer; state it.
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
