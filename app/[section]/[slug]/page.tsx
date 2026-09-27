import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DetailPageView from "@/components/detail/DetailPageView";
import { detailParams, findDetailPage } from "@/lib/pages/registry";

/**
 * Every drop's detail page, on one route.
 *
 * ── Why a dynamic pair and not four route folders ──
 *
 * The alternative is `app/services/[slug]`, `app/work/[slug]`, `app/about/[slug]`
 * and `app/contact/[slug]` — four files that differ only in a string, all
 * delegating to the same view. The URLs come out identical. With the parameter
 * space closed by `dynamicParams` below there is no safety bought by writing it
 * out four times, so it is written once.
 *
 * ── Why a root-level dynamic segment is safe here ──
 *
 * Two things close it. `dynamicParams = false` means only the pairs
 * `generateStaticParams` returns are ever rendered; anything else is a 404
 * rather than a blank page under a URL nobody authored. And the App Router
 * always resolves a static segment ahead of a dynamic one, so `/privacy`,
 * `/terms` and `/` keep their own routes regardless of what `[section]` would otherwise match.
 *
 * The page itself is a server component. Only the view below it is a client
 * component, because that is where the canvas and the scroll reveals are.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return detailParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string; slug: string }>;
}): Promise<Metadata> {
  const { section, slug } = await params;
  const page = findDetailPage(section, slug);
  if (!page) return {};

  // The promise line is the description everywhere it is asked for. It is one
  // declarative sentence written to stand alone, which is exactly the brief for
  // a meta description and an OG subtitle, so there is no second copy of it to
  // drift out of sync with the page.
  return {
    title: `${page.title} | Crovion`,
    description: page.promise,
    openGraph: {
      title: `${page.title} | Crovion`,
      description: page.promise,
      type: "article",
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ section: string; slug: string }>;
}) {
  // `params` is a promise in this version of Next and has to be awaited — see
  // node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md.
  const { section, slug } = await params;
  const page = findDetailPage(section, slug);

  // Unreachable while `dynamicParams` is false, and kept anyway: it is what
  // makes the lookup total rather than a non-null assertion, and it is the
  // correct behaviour the moment anyone flips that flag.
  if (!page) notFound();

  return <DetailPageView page={page} />;
}
