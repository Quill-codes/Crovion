"use client";

import { useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";
import SilkAuroraBackground from "@/components/SilkAuroraBackground";
import SmoothScroll from "@/components/SmoothScroll";
import Reveal from "@/components/detail/Reveal";
import { useLenis } from "@/hooks/useLenis";
import { CONTACT } from "@/lib/contact";
import type { LegalBlock, LegalDocument } from "@/lib/pages/legal";

/**
 * A fixed navbar sits over the first ~90 px of the viewport, so a heading
 * scrolled exactly to the top is a heading behind the chrome.
 */
const JUMP_OFFSET = -112;

/**
 * One legal document — currently the privacy policy, next the terms.
 *
 * ── What this page does not have ──
 *
 * No blob. The detail pages put a body of colour behind the type because each
 * one is a sphere the reader clicked and the colour is the continuity; a policy
 * is not a drop, nobody arrives at it from the canvas, and a slow-drifting
 * gradient behind seventeen sections of legal copy competes with the only thing
 * on the page that matters. The silk ground stays, because that is the site's
 * paper and a page without it reads as a different domain.
 *
 * ── Why the reader gets a contents list ──
 *
 * Seventeen numbered sections is a document people arrive at with one question —
 * how do I get my data deleted, what do you do with cookies — and scrolling for
 * it is the whole cost of not answering. The list is also the reason the
 * sections carry ids: a support reply can link `/privacy#s11` and land on the
 * rights section.
 *
 * ── Scrolling ──
 *
 * Every jump goes through Lenis rather than through a native anchor. A native
 * jump moves the document while Lenis keeps its own stale position, and the next
 * wheel event animates from that stale value — the lurch documented in
 * `hooks/useLenis.tsx`. The links stay real anchors so they can be copied and
 * opened in a new tab; only their default is taken over.
 */

export default function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <>
      {/* The homepage's four colours and settings, unchanged — see the note in
          `DetailPageView`: the ground has to be continuous across navigation. */}
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

      <SmoothScroll>
        {/* The document is a separate component for one reason, and it is not
            tidiness: `useLenis` reads a context this component *provides*, so
            called up here it would resolve to the default value — a null
            instance and a `scrollTo` that silently does nothing — and every jump
            below would fall through to a native one, which is precisely the
            desync `hooks/useLenis.tsx` documents. The consumer has to sit inside
            the provider. */}
        <LegalDocumentBody doc={doc} />
      </SmoothScroll>
    </>
  );
}

function LegalDocumentBody({ doc }: { doc: LegalDocument }) {
  const { lenis } = useLenis();

  const jump = (id: string) => {
    lenis?.scrollTo(`#${id}`, { duration: 1.4, offset: JUMP_OFFSET });
  };

  /**
   * Arriving on `/privacy#s11` from somewhere else.
   *
   * `LenisProvider` deliberately sends the document to 0 on mount — it owns
   * scroll restoration so Lenis and the page start from the same place — which
   * also discards the browser's own jump to the fragment. Honouring the hash is
   * therefore this page's job, once, after Lenis exists to perform it.
   *
   * `immediate`, not a 1.4 s tween: a fragment link is a reader saying *put me
   * at section 9*, not asking to watch eight sections go past — and during a
   * tween their first wheel event cancels the jump and strands them mid-page.
   *
   * It runs twice because the first one is aimed at a document that is still
   * moving. The display serif and the body face both arrive by `font-display:
   * swap`, and on a document this long the reflow when they land is worth real
   * distance — measured on `/terms#s23`, a single jump put the heading 240 px
   * below the viewport top instead of 112. So the position is re-asserted once
   * the faces have settled, unless the reader has already taken over by then.
   */
  useEffect(() => {
    if (!lenis) return;
    const id = window.location.hash.slice(1);
    const el = id ? document.getElementById(id) : null;
    if (!el) return;

    let taken = false;
    const cede = () => {
      taken = true;
    };
    // Passive: these only ever cancel, so they must not be able to hold up the
    // scroll they are watching for.
    const opts = { passive: true, once: true } as const;
    window.addEventListener("wheel", cede, opts);
    window.addEventListener("touchstart", cede, opts);
    window.addEventListener("keydown", cede, opts);

    // Resolved to an absolute document position rather than handed to Lenis as
    // an element: Lenis works an element out against the scroll position it
    // believes it is at, and on the very first frames of a mount that belief is
    // still catching up with the document. `rect.top + scrollY` is measured from
    // the DOM either way and cannot be a frame behind.
    const go = () => {
      if (taken) return;
      const top =
        el.getBoundingClientRect().top + window.scrollY + JUMP_OFFSET;
      lenis.scrollTo(Math.max(0, top), { immediate: true });
    };

    go();
    // `document.fonts` is everywhere the site's WebGL is, so the optional call
    // is for the type rather than for any browser this page will meet.
    document.fonts?.ready.then(() => requestAnimationFrame(go));
    // And once more when everything else the page pulls in has landed.
    if (document.readyState !== "complete") {
      window.addEventListener("load", () => requestAnimationFrame(go), {
        once: true,
      });
    }

    return () => {
      cede();
      window.removeEventListener("wheel", cede);
      window.removeEventListener("touchstart", cede);
      window.removeEventListener("keydown", cede);
    };
  }, [lenis]);

  return (
    <main className="relative z-10 min-h-screen">
      <Navbar away />

      <article className="px-6 md:px-12 lg:px-20">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <header className="pt-36 md:pt-48 pb-16 md:pb-20">
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
              Home
            </Link>
          </Reveal>

          <Reveal onMount delay={0.06}>
            <h1 className="mt-8 font-serif text-brand-text text-[clamp(42px,7.5vw,104px)] leading-[0.98] tracking-[-0.03em]">
              {doc.title}
            </h1>
          </Reveal>

          <Reveal onMount delay={0.12}>
            <p className="mt-7 text-brand-muted text-[10px] tracking-[0.28em] uppercase font-medium">
              Last updated {doc.updated}
            </p>
          </Reveal>

          <Reveal onMount delay={0.18}>
            {/* The same 68-character measure the sections use, so the intro
                and the body read as one column rather than as a lede set
                over something else. */}
            <div className="mt-10 max-w-[68ch] flex flex-col gap-5">
              {doc.intro.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>
          </Reveal>
        </header>

        {/* ── Contents ─────────────────────────────────────────────── */}
        <Reveal>
          <nav
            aria-label="Sections of this document"
            className="border-t border-brand-text/15 pt-8 pb-20 md:pb-28"
          >
            <h2 className="mb-8 text-brand-muted text-[10px] tracking-[0.28em] uppercase font-medium">
              Contents
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-1">
              {doc.sections.map((section) => (
                <li key={section.n}>
                  <a
                    href={`#s${section.n}`}
                    onClick={(e) => {
                      e.preventDefault();
                      jump(`s${section.n}`);
                    }}
                    className="group flex items-baseline gap-4 py-1.5 text-brand-text-secondary hover:text-brand-text transition-colors duration-300"
                  >
                    <span className="shrink-0 w-6 text-brand-muted text-[11px] tracking-[0.16em] font-medium tabular-nums">
                      {String(section.n).padStart(2, "0")}
                    </span>
                    <span className="text-[16px] font-light leading-[1.5]">
                      {section.title}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Reveal>

        {/* ── The document ─────────────────────────────────────────── */}
        {doc.sections.map((section) => (
          <section
            key={section.n}
            id={`s${section.n}`}
            // Belt and braces for the Lenis offset above: a browser that
            // performs a native fragment jump anyway — a middle-click into a
            // new tab, JS disabled — still clears the fixed navbar.
            className="scroll-mt-32 py-10 md:py-14 border-t border-brand-text/12"
          >
            <Reveal>
              <h2 className="flex items-baseline gap-5 md:gap-7">
                <span className="shrink-0 font-serif text-brand-accent text-[15px] tracking-[0.1em] tabular-nums">
                  {String(section.n).padStart(2, "0")}
                </span>
                <span className="font-serif text-brand-text text-[clamp(24px,3vw,38px)] leading-[1.14] tracking-[-0.02em]">
                  {section.title}
                </span>
              </h2>
            </Reveal>

            <Reveal delay={0.06}>
              {/* Indented to the heading's text column on wide viewports so
                  the numbers form a margin the eye can run down; flush on
                  phones, where 60 px of indent is 20 % of the measure. */}
              <div className="mt-7 md:ml-[calc(15px+1.75rem)] max-w-[68ch] flex flex-col gap-5">
                {section.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
            </Reveal>
          </section>
        ))}
        {doc.outro && (
          <Reveal>
            {/* Set at the section blocks' own indent so the closing line
                lands in the column the reader has been reading down, not
                back out at the page margin. */}
            <div className="md:ml-[calc(15px+1.75rem)] max-w-[68ch] pt-14 md:pt-16">
              {doc.outro.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>
          </Reveal>
        )}
      </article>

      <div className="h-24 md:h-32" />

      <FooterSection away />
    </main>
  );
}


/** One block of a document. Four shapes, declared once. */
function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "para":
      return (
        <p className="text-brand-text-secondary text-[16px] md:text-[17px] font-light leading-[1.7]">
          <Body text={block.body} />
        </p>
      );

    case "sub":
      return (
        <h3 className="mt-4 text-brand-text text-[18px] md:text-[19px] font-normal tracking-[-0.01em]">
          {block.body}
        </h3>
      );

    case "note":
      // Bold in the source. Bolding a 40-word sentence inside a light-weight
      // body column produces a grey blur rather than emphasis, so the weight
      // stays and the emphasis comes from the rule and the ink: full-strength
      // text against secondary, and an accent edge the eye stops at.
      return (
        <p className="border-l-2 border-brand-accent pl-5 md:pl-6 text-brand-text text-[17px] md:text-[18px] font-normal leading-[1.6]">
          <Body text={block.body} />
        </p>
      );

    case "list":
      return (
        <ul className="flex flex-col gap-2.5">
          {block.items.map((item) => (
            <li key={item} className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="mt-[10px] w-1.5 h-1.5 rounded-full bg-brand-accent/70 shrink-0"
              />
              <span className="text-brand-text-secondary text-[16px] md:text-[17px] font-light leading-[1.6]">
                <Body text={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "fields":
      // A definition list, because that is what it is: seven labels and the
      // values they identify. Stacked on phones and paired on anything wider.
      return (
        <dl className="rounded-2xl border border-brand-text/12 bg-white/45 backdrop-blur-[2px] px-6 py-5 md:px-8 md:py-7 divide-y divide-brand-text/10">
          {block.rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,13rem)_1fr] gap-x-6 gap-y-1 py-3.5 first:pt-0 last:pb-0"
            >
              <dt className="text-brand-muted text-[10px] tracking-[0.2em] uppercase font-medium sm:pt-[5px]">
                {row.label}
              </dt>
              <dd className="text-brand-text text-[16px] md:text-[17px] font-light leading-[1.55] break-words">
                <Body text={row.value} />
              </dd>
            </div>
          ))}
        </dl>
      );

    case "contact":
      return (
        <address className="not-italic rounded-2xl border border-brand-text/12 bg-white/45 backdrop-blur-[2px] px-6 py-5 md:px-8 md:py-7">
          <span className="block text-brand-text text-[18px] md:text-[19px] font-normal">
            Crovion
          </span>
          <span className="mt-2 block text-brand-text-secondary text-[16px] md:text-[17px] font-light leading-[1.6]">
            {CONTACT.address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            <span className="block">India</span>
          </span>
          <a
            href={CONTACT.emailHref}
            className="mt-4 inline-block text-brand-accent hover:text-brand-accent-hover text-[16px] md:text-[17px] font-light underline underline-offset-4 decoration-brand-accent/35 hover:decoration-brand-accent transition-colors duration-300"
          >
            {CONTACT.email}
          </a>
        </address>
      );
  }
}

/**
 * Body copy with the studio's address made clickable.
 *
 * The policy names the contact address eight times, and each one is a reader
 * being told this is how you exercise a right — so each one should open a mail
 * client rather than ask to be transcribed. Splitting on the constant keeps the
 * copy in `lib/pages/legal.ts` free of markup and means a change of address in
 * `lib/contact.ts` still links everywhere it appears.
 */
function Body({ text }: { text: string }) {
  const parts = text.split(CONTACT.email);
  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <a
              href={CONTACT.emailHref}
              className="text-brand-accent hover:text-brand-accent-hover underline underline-offset-4 decoration-brand-accent/35 hover:decoration-brand-accent transition-colors duration-300"
            >
              {CONTACT.email}
            </a>
          )}
        </span>
      ))}
    </>
  );
}
