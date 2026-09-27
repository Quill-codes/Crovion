import type { Metadata } from "next";
import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { TERMS_AND_CONDITIONS } from "@/lib/pages/legal";

/**
 * `/terms` — the second of the footer's three policy links.
 *
 * A static segment for the same reason `/privacy` is one, and the same shape:
 * the document is data in `lib/pages/legal.ts`, the layout is the one view both
 * documents share, and this file is a route and a `<head>`.
 */
export const metadata: Metadata = {
  title: `${TERMS_AND_CONDITIONS.title} | Crovion`,
  description:
    "The terms governing use of crovion.com and engagement with Crovion for Performance Marketing and Website Development services.",
  openGraph: {
    title: `${TERMS_AND_CONDITIONS.title} | Crovion`,
    description:
      "The terms governing use of crovion.com and engagement with Crovion for Performance Marketing and Website Development services.",
    type: "article",
  },
};

export default function Page() {
  return <LegalDocumentView doc={TERMS_AND_CONDITIONS} />;
}
