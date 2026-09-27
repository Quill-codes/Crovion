"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";
import SilkAuroraBackground from "@/components/SilkAuroraBackground";
import SmoothScroll from "@/components/SmoothScroll";
import DetailBlob from "./DetailBlob";
import Reveal from "./Reveal";
import { SECTION_LABELS, type DetailPage } from "@/lib/pages/registry";
import { CONTACT } from "@/lib/contact";

/**
 * One drop's detail page.
 *
 * ── The six blocks ──
 *
 * Hero, the problem, what we run, how it works, what you get, CTA. Identical
 * across every page in the set, and that is the point rather than a shortcut:
 * sixteen pages assembled from one skeleton read as one system, and a reader who
 * has been through one knows where to look on the next. The copy differs; the
 * layout does not.
 *
 * ── Chrome ──
 *
 * The same silk ground, navbar and footer as the homepage, so a page opened off
 * a sphere does not feel like a different site.
 *
 * `SmoothScroll` is not decoration here and cannot be dropped. `FooterSection`
 * calls `useLenis().scrollTo` for its back-to-top control; outside the provider
 * that resolves to the default context, whose `scrollTo` is a no-op, and the
 * control silently dies. Both it and the navbar are told they are `away` from
 * the homepage so their section anchors become navigation rather than scrolls
 * into a document that has no such sections.
 *
 * ── One visual per section, maximum ──
 *
 * There are none yet. These pages carry a lot of text and the design does more
 * work if the visuals are rationed, so they arrive one at a time and only where
 * they make an argument the copy cannot — the divergence between platform and
 * blended ROAS, the catalog-to-checkout loop. Everything below is type,
 * hairlines and one body of colour.
 */
export default function DetailPageView({ page }: { page: DetailPage }) {
  const sectionLabel = SECTION_LABELS[page.section] ?? page.section;

  // Prefilled, because the CTA on every page asks for a specific thing and the
  // reader should not have to retype which page they came from. The footer's
  // address is the channel a button can actually open — the footer carries the
  // phone number and the studio address beside it, but a link cannot dial and
  // cannot navigate. Pointing at an anchor instead would be a control that lands
  // the reader a screen further down and no closer to talking to anyone.
  const mailto = `${CONTACT.emailHref}?subject=${encodeURIComponent(
    `${page.title} — ${page.cta.label}`
  )}`;

  /**
   * The background body is mounted a beat after the page, not with it.
   *
   * Bringing up a WebGL context means compiling and linking the pipeline's
   * shader programs, and that work is synchronous on the main thread. Mounted
   * with the page it lands squarely on top of the hero's entrance: measured on
   * a cold load, the title was still part-way through a 0.75 s fade four seconds
   * in, because the rAF driving it was being starved by the compile. The copy is
   * the page; the body behind it is decoration, and decoration does not get to
   * delay the thing it decorates.
   *
   * ~1 s is the hero's own entrance (0.18 s stagger + 0.75 s), so the body
   * begins arriving as the type finishes. That is close enough to the brief's
   * "scales up and settles" that the two still read as one arrival.
   *
   * Deliberately not `requestIdleCallback`: Safari did not ship it until 2022
   * and the fallback path is this timer anyway, so this is the fallback without
   * the branch.
   */
  const [blobReady, setBlobReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBlobReady(true), 950);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {/* Same four colours and the same settings as the homepage. The ground has
          to be continuous across the navigation or the page reads as a
          different site rather than a deeper part of this one. */}
      <SilkAuroraBackground
        baseColor="#F5F3F2"
        midColor="#EBE9EE"
        sheenColor="#D8D2F2"
        accentColor="#CFE0F2"
        speed={0.8}
        intensity={0.9}
        grain={0.5}
        vignette={0.7}
        mouseInfluence={0.7}
      />

      {/* The body the clicked sphere becomes. Sits above the silk ground and
          below the type — it is the page's background, not an illustration in
          it. Late by ~1 s; see `blobReady`. */}
      {blobReady && <DetailBlob tint={page.tint} />}

      <SmoothScroll>
        <main className="relative z-10 min-h-screen">
          <Navbar away />

          <article>
            {/* ── 1 · Hero ─────────────────────────────────────────────── */}
            <header className="px-6 md:px-12 lg:px-20 pt-36 md:pt-48 pb-24 md:pb-32">
              <div className="max-w-6xl">
                <Reveal onMount>
                  <Link
                    href="/"
                    className="group inline-flex items-center gap-2.5 text-brand-muted text-[10px] tracking-[0.28em] uppercase font-medium hover:text-brand-text transition-colors duration-300"
                  >
                    <svg
                      width="14"
                      height="10"
                      viewBox="0 0 14 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="transition-transform duration-300 group-hover:-translate-x-1"
                    >
                      <path d="M13 5H1M1 5l4-4M1 5l4 4" />
                    </svg>
                    {sectionLabel}
                  </Link>
                </Reveal>

                <Reveal onMount delay={0.06}>
                  <h1 className="mt-8 font-serif text-brand-text text-[clamp(42px,7.5vw,104px)] leading-[0.98] tracking-[-0.03em]">
                    {page.title}
                  </h1>
                </Reveal>

                <Reveal onMount delay={0.12}>
                  {/* The promise carries the page. It is set as large as the
                      title's second line would be and in the body face, so it
                      reads as a statement rather than as a subtitle. */}
                  <p className="mt-8 max-w-[40ch] text-brand-text text-[clamp(20px,2.4vw,30px)] font-light leading-[1.32] tracking-[-0.01em]">
                    {page.promise}
                  </p>
                </Reveal>

                <Reveal onMount delay={0.18}>
                  {/* A narrow measure on purpose — 58 characters. The page is
                      wide and the paragraph is not allowed to be. */}
                  <p className="mt-10 max-w-[58ch] text-brand-text-secondary text-[17px] md:text-[18px] font-light leading-[1.65]">
                    {page.hero}
                  </p>
                </Reveal>
              </div>
            </header>

            {/* ── 2 · The problem ──────────────────────────────────────── */}
            <Section label="The problem">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-12">
                {page.problems.map((problem, i) => (
                  <Reveal key={problem} delay={i * 0.08}>
                    <div className="border-t border-brand-text/15 pt-6 h-full">
                      <span className="block font-serif text-brand-accent text-[15px] tracking-[0.1em] mb-5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="text-brand-text text-[19px] md:text-[21px] font-light leading-[1.42] tracking-[-0.01em]">
                        {problem}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </Section>

            {/* ── 3 · What we run ──────────────────────────────────────── */}
            <Section label="What we run">
              <ul className="border-t border-brand-text/15">
                {page.runs.map((run, i) => (
                  <li key={run}>
                    <Reveal delay={Math.min(i, 3) * 0.05}>
                      {/* Hairline-separated rows rather than bullets. These are
                          six sentences of uneven length, and a bulleted list
                          sets them as fragments where the rule sets them as
                          entries in a schedule of work. */}
                      <div className="flex items-baseline gap-6 md:gap-10 border-b border-brand-text/15 py-6 md:py-7">
                        <span className="shrink-0 w-8 text-brand-muted text-[11px] tracking-[0.2em] font-medium tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-brand-text text-[17px] md:text-[19px] font-light leading-[1.5] max-w-[68ch]">
                          {run}
                        </span>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </Section>

            {/* ── 4 · How it works ─────────────────────────────────────── */}
            <Section label="How it works">
              <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
                {page.phases.map((phase, i) => (
                  <li key={phase.name}>
                    <Reveal delay={(i % 2) * 0.08}>
                      <div className="h-full rounded-2xl border border-brand-text/12 bg-white/45 backdrop-blur-[2px] p-7 md:p-9">
                        <span className="block font-serif text-brand-text/25 text-[40px] leading-none mb-6">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3 className="text-brand-text text-[20px] md:text-[22px] font-normal tracking-[-0.01em]">
                          {phase.name}
                          {phase.when && (
                            // The timing is a qualifier, not part of the name,
                            // so it is set apart from it rather than run into
                            // it — a phase called "Audit" stays findable.
                            <span className="ml-3 align-middle inline-block rounded-full border border-brand-text/15 px-2.5 py-[3px] text-brand-muted text-[10px] tracking-[0.14em] uppercase font-medium">
                              {phase.when}
                            </span>
                          )}
                        </h3>
                        <p className="mt-4 text-brand-text-secondary text-[16px] md:text-[17px] font-light leading-[1.6]">
                          {phase.body}
                        </p>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ol>
            </Section>

            {/* ── 5 · What you get ─────────────────────────────────────── */}
            <Section label="What you get">
              <Reveal>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
                  {page.deliverables.map((item) => (
                    <li key={item} className="flex items-start gap-4">
                      <span
                        aria-hidden="true"
                        className="mt-[10px] w-1.5 h-1.5 rounded-full bg-brand-accent shrink-0"
                      />
                      <span className="text-brand-text text-[17px] md:text-[19px] font-light leading-[1.5]">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </Section>

            {/* ── 6 · CTA ──────────────────────────────────────────────── */}
            {/* Every page in the set ends on this shape. The copy differs, the
                layout does not — which is what makes the last screen of a page
                a place the reader recognises rather than one more block. */}
            <section className="px-6 md:px-12 lg:px-20 pb-32 md:pb-44 pt-8">
              <Reveal>
                <div className="max-w-4xl">
                  <p className="font-serif text-brand-text text-[clamp(30px,4.6vw,60px)] leading-[1.08] tracking-[-0.025em]">
                    {page.cta.line}
                  </p>

                  <a
                    href={mailto}
                    className="group mt-12 inline-flex items-center gap-4 rounded-full bg-brand-accent hover:bg-brand-accent-hover pl-8 pr-3 py-3 transition-colors duration-300"
                  >
                    <span className="text-white text-[11px] md:text-[12px] font-semibold tracking-[0.2em] uppercase">
                      {page.cta.label}
                    </span>
                    <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:translate-x-1">
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 10 10"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M2 5H8M8 5L5.5 2.5M8 5L5.5 7.5"
                          stroke="#6D4AFF"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </a>
                </div>
              </Reveal>
            </section>
          </article>

          <FooterSection away />
        </main>
      </SmoothScroll>
    </>
  );
}

/**
 * One block, with the small tracked label the whole set is divided by.
 *
 * The label is a real heading rather than a styled span. Five of these are the
 * page's structure, and a reader moving through it by headings should get the
 * structure rather than a single `h1` and a wall.
 */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
      <Reveal>
        <h2 className="mb-14 md:mb-16 text-brand-muted text-[10px] tracking-[0.28em] uppercase font-medium">
          {label}
        </h2>
      </Reveal>
      {children}
    </section>
  );
}
