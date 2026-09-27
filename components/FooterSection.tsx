"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { animate, stagger } from "animejs";
import { useLenis } from "@/hooks/useLenis";
import { CONTACT } from "@/lib/contact";

/**
 * The closing block, built to the reference's footer composition:
 * a full-bleed colour plate carrying a large nav column on the left, a stack of
 * secondary links beside it, and the company line set oversized in serif and
 * cropped by the right edge.
 *
 * ── Colour ──
 * The plate is the head sphere's own mid tone. The chain reads violet → rose →
 * orchid and then the page ends on the violet it opened with, so the footer is
 * the hero sphere enlarged to the full width rather than a new colour arriving
 * at the bottom of the page.
 *
 * Type is ink, not white, and that is a departure from the reference — which
 * runs white on a saturated red. It cannot carry over: white on this plate
 * measures about 1.8:1, and the same call was already made once in this codebase
 * for `SphereLabel`, where white measured 2.0:1 against the rose blob and ink
 * measured 8.9:1. Ink on the plate is 9.1:1. The reference's own structure is
 * preserved — one flat chromatic ground, one tonal step for the wordmark — but
 * the polarity flips because the ground is light.
 *
 * ── The wordmark ──
 * Deliberately cropped. In the reference it runs past the right edge rather than
 * being centred and complete, which is what stops it reading as a logo lockup
 * and makes it read as a ground texture. It is `aria-hidden` for that reason: it
 * is a graphic element, and the same words are already in the copyright line
 * below it, so a screen reader announcing it twice would be noise.
 */
export default function FooterSection({
  away = false,
}: {
  /**
   * This footer is on a detail page rather than the homepage.
   *
   * Same reasoning as `Navbar`'s prop of the same name: the four section
   * targets below are in-page anchors, and a Lenis scroll to an anchor that is
   * not in the document is a control that does nothing. With `away` set they
   * become links back to the homepage instead.
   *
   * TOP is exempt and stays a scroll in both cases — it means the top of the
   * page you are on, and that is true everywhere.
   */
  away?: boolean;
} = {}) {
  const footerRef = useRef<HTMLElement>(null);
  const hasAnimated = useRef(false);
  const { scrollTo } = useLenis();

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;

            // anime v4's animate() takes no third positional argument — a
            // stagger belongs on `delay`, where it actually applies.
            animate(".footer-nav-item", {
              translateY: [40, 0],
              opacity: [0, 1],
              duration: 800,
              easing: "easeOutCubic",
              delay: stagger(60),
            });

            animate(".footer-detail", {
              translateY: [24, 0],
              opacity: [0, 1],
              duration: 700,
              easing: "easeOutCubic",
              delay: stagger(70, { start: 300 }),
            });
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  // Mirrors the navbar's targets so the two agree. TOP is the odd one out: the
  // navbar points it at `#top`, which is an anchor no element in the tree
  // actually carries, so it silently does nothing there. Here it runs through
  // Lenis instead — a native jump would desync Lenis's internal position and
  // lurch the pinned hero on the next wheel event, which is the exact failure
  // the provider's own comment documents.
  const navItems = [
    { label: "TOP", target: 0 as const },
    { label: "FEATURES", target: "#features" },
    { label: "PROJECTS", target: "#work" },
    { label: "ABOUT", target: "#about" },
    { label: "CONTACT", target: "#contact" },
  ];

  // Hrefs live in `lib/contact.ts` so the handles have one home. Only channels
  // the studio actually runs are listed — a link to a profile that does not
  // exist is worse than an absent one.
  const social = [
    { name: "Instagram", href: CONTACT.social.instagram },
    { name: "LinkedIn", href: CONTACT.social.linkedin },
  ];
  // The policy links. `href` is `null` for a document that has not been written
  // yet — a real route renders a `Link`, a null renders inert text
  // rather than an `<a href="#">`, which announces itself to a screen reader as
  // a link and then throws the reader back to the top of the page when it is
  // followed. Give a document a route and it becomes a link here by adding one.
  const policy: { name: string; href: string | null }[] = [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms & Conditions", href: "/terms" },
    { name: "Accessibility", href: null },
  ];

  return (
    <footer
      id="contact"
      ref={footerRef}
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: "#C4A9F7" }}
    >
      {/* Back to top — straddling the top edge, as in the reference, so the
          plate reads as being pinned to the page by it. */}
      <button
        type="button"
        onClick={() => scrollTo(0)}
        aria-label="Back to top"
        className="absolute top-0 right-6 md:right-12 lg:right-20 -translate-y-1/2 z-20 w-14 h-14 md:w-16 md:h-16 rounded-full bg-brand-surface flex items-center justify-center shadow-[0_8px_30px_rgba(20,19,26,0.12)] hover:-translate-y-[calc(50%+4px)] transition-transform duration-300"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="#9A6BEE"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M9 15V3M9 3L3.5 8.5M9 3l5.5 5.5" />
        </svg>
      </button>

      {/* The oversized company line, cropped by the right edge. */}
      <span
        aria-hidden="true"
        // The crop is the point — see the note above — but 18 % of a phone-width
        // line is 65 px past the edge, measured, which is more than the design
        // intends and enough that "COMPANY" loses its last two letters. 8 % keeps
        // the wordmark reading as ground texture rather than as a lockup while
        // staying inside what the frame can carry.
        className="pointer-events-none select-none absolute right-0 bottom-16 md:bottom-20 translate-x-[8%] md:translate-x-[18%] font-serif leading-[0.82] tracking-[-0.03em] text-right whitespace-nowrap text-[clamp(80px,15vw,220px)]"
        style={{ color: "rgba(255,255,255,0.40)" }}
      >
        THE TOTAL
        <br />
        BRANDING
        <br />
        COMPANY
      </span>

      <div className="relative z-10 px-6 md:px-12 lg:px-20 pt-28 md:pt-36 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-y-14 md:gap-x-8">
          {/* Primary nav */}
          <nav className="md:col-span-5 lg:col-span-4">
            <ul>
              {navItems.map((item, i) => {
                const dot = (
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-full bg-brand-text shrink-0 transition-opacity duration-300 ${
                      i === 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  />
                );
                const face =
                  "group flex items-baseline gap-3 text-brand-text font-light text-[clamp(28px,4vw,44px)] leading-[1.25] tracking-[-0.01em] hover:opacity-60 transition-opacity duration-300";

                return (
                  <li key={item.label} className="footer-nav-item opacity-0">
                    {away && typeof item.target === "string" ? (
                      <Link href={`/${item.target}`} className={face}>
                        {dot}
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => scrollTo(item.target)}
                        className={face}
                      >
                        {dot}
                        {item.label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Secondary links */}
          <div className="md:col-span-4 lg:col-span-3 flex flex-col gap-10">
            <ul className="flex flex-col gap-3">
              {social.map(({ name, href }) => (
                <li key={name} className="footer-detail opacity-0">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-brand-text text-lg md:text-xl font-light hover:opacity-60 transition-opacity duration-300"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 13 13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      aria-hidden="true"
                    >
                      <path d="M3 10 L10 3M4.4 3H10v5.6" />
                    </svg>
                    {name}
                  </a>
                </li>
              ))}
            </ul>

            <ul className="flex flex-col gap-2">
              {policy.map(({ name, href }) => (
                <li key={name} className="footer-detail opacity-0">
                  {href ? (
                    <Link
                      href={href}
                      className="text-brand-text/85 text-base font-light hover:text-brand-text transition-colors duration-300"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="text-brand-text/45 text-base font-light">
                      {name}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {/* The real channels. The globe-and-"Global" line that used to sit
                here said nothing a visitor could act on; a studio with one
                address is better served by giving it. Email and phone are set
                at the same size as the social links above so the column reads
                as one list, and the postal address drops to body size because
                it is reference rather than a control. */}
            <address className="footer-detail opacity-0 not-italic">
              <span className="inline-flex items-center gap-2 text-brand-text/85 text-sm mb-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  aria-hidden="true"
                >
                  <circle cx="7" cy="7" r="5.6" />
                  <path d="M1.4 7h11.2M7 1.4c1.5 1.6 2.2 3.5 2.2 5.6S8.5 10.9 7 12.6c-1.5-1.7-2.2-3.5-2.2-5.6S5.5 3 7 1.4Z" />
                </svg>
                New Delhi
              </span>

              <a
                href={CONTACT.emailHref}
                className="block text-brand-text text-lg md:text-xl font-light hover:opacity-60 transition-opacity duration-300"
              >
                {CONTACT.email}
              </a>
              <a
                href={CONTACT.phoneHref}
                className="block mt-1 text-brand-text text-lg md:text-xl font-light hover:opacity-60 transition-opacity duration-300"
              >
                {CONTACT.phone}
              </a>

              <p className="mt-5 text-brand-text/85 text-base font-light leading-[1.6]">
                {CONTACT.address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
            </address>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="footer-detail opacity-0 relative z-10 flex flex-wrap gap-4 items-end justify-between pt-24 md:pt-32">
          <span className="text-brand-text/70 text-[10px] tracking-[0.2em] uppercase font-medium">
            © 2026 Crovion — All rights reserved
          </span>
          <span className="font-serif text-brand-text text-2xl md:text-3xl tracking-[0.12em]">
            CROVION
          </span>
        </div>
      </div>
    </footer>
  );
}
