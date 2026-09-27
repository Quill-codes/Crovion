import type { Metadata } from "next";
import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { PRIVACY_POLICY } from "@/lib/pages/legal";

/**
 * `/privacy` — the policy the footer links to.
 *
 * A static segment rather than another pair under `[section]/[slug]`: the
 * dynamic route is closed by `dynamicParams = false` and describes drops on the
 * canvas, which a legal document is not, and the App Router resolves a static
 * segment ahead of a dynamic one regardless.
 *
 * Server component. Only the view below is a client component, because the
 * chrome it mounts — Lenis, the silk ground, the reveals — is.
 */
export const metadata: Metadata = {
  title: `${PRIVACY_POLICY.title} | Crovion`,
  description:
    "How Crovion collects, uses, stores, and protects information when you visit crovion.com or work with us.",
  openGraph: {
    title: `${PRIVACY_POLICY.title} | Crovion`,
    description:
      "How Crovion collects, uses, stores, and protects information when you visit crovion.com or work with us.",
    type: "article",
  },
};

export default function Page() {
  return <LegalDocumentView doc={PRIVACY_POLICY} />;
}
