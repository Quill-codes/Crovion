"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useLenis } from "@/hooks/useLenis";

const NAV_LINKS = [
  { index: "01", label: "Features", target: "#features" },
  { index: "02", label: "Projects", target: "#work" },
  { index: "03", label: "About", target: "#about" },
  { index: "04", label: "Contact", target: "#contact" },
];

/**
 * `away` marks a route that is not the homepage — a drop's detail page.
 *
 * The targets above are all in-page anchors resolved through Lenis, which is
 * correct on the homepage and meaningless anywhere else: `scrollTo("#work")`
 * on a page with no `#work` scrolls nowhere and gives the reader a dead
 * control. Set `away` and the same list becomes real navigation back to the
 * homepage, and the wordmark becomes a link home rather than a scroll to the
 * top of wherever you already are.
 *
 * Defaults false, so the homepage's markup and behaviour are unchanged.
 */
export default function Navbar({ away = false }: { away?: boolean } = {}) {
  const { scrollTo } = useLenis();
  const [open, setOpen] = useState(false);

  /**
   * The bar earns a ground once the page has scrolled under it — detail pages
   * only.
   *
   * The homepage does not need one: the hero is a WebGL field with no type
   * anywhere near the top edge, and the reference's own header sits on nothing.
   * A detail page is a column of body copy running the full height of the
   * document, and every line of it passes under a transparent fixed bar. The
   * wordmark and the copy collide, and both lose.
   *
   * A wash and a blur rather than a solid fill or a rule: the silk ground is
   * animated and lightly coloured, and a flat bar across the top of it reads as
   * a different surface pasted on. Listening to native `scroll` is correct even
   * though Lenis owns the wheel — Lenis animates the real scroll position, so
   * the event fires exactly as it would otherwise.
   */
  const [grounded, setGrounded] = useState(false);
  useEffect(() => {
    if (!away) return;
    const onScroll = () => setGrounded(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [away]);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    target: string
  ) => {
    e.preventDefault();
    setOpen(false);
    scrollTo(target);
  };

  return (
    <>
      {/*
        No entrance. This used to fade in on `delay: 3` — a third hard-coded
        clock, and the only one that animated the page's *chrome*.

        Bravis's nav is server-rendered at full opacity from first paint and sits
        underneath the curtain the entire time; the curtain's own dissolve is what
        reveals it, so it is at full contrast roughly 0.35 s in, before anything
        else on the page exists. The study finds not a single tween in their intro
        targeting the header, and reads it as a decision rather than an oversight:
        animating the nav in tells the viewer the page is still arriving, while
        leaving it static says it was always there and the *content* is what is
        arriving.

        It is also the cheapest single improvement available here — a deletion.
      */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 md:px-10 md:py-6 pointer-events-auto transition-[background-color,backdrop-filter] duration-500 ${
          grounded ? "bg-brand-bg/70 backdrop-blur-xl" : ""
        }`}
      >
        {/* Wordmark */}
        {away ? (
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="text-brand-text text-sm md:text-base font-semibold tracking-[0.3em] uppercase"
          >
            Crovion
          </Link>
        ) : (
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              scrollTo(0);
            }}
            className="text-brand-text text-sm md:text-base font-semibold tracking-[0.3em] uppercase"
          >
            Crovion
          </a>
        )}

        {/* Right side: EN + hamburger */}
        <div className="flex items-center gap-4">
          <span className="text-brand-text text-xs font-semibold tracking-wider uppercase">
            EN
          </span>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-brand-accent flex items-center justify-center cursor-pointer hover:scale-105 transition-transform duration-300 group"
          >
            <div className="flex flex-col gap-[5px] items-center">
              <span
                className={`w-[18px] h-[2px] bg-white rounded-full transition-all duration-300 ${
                  open
                    ? "translate-y-[3.5px] rotate-45"
                    : "group-hover:w-[14px]"
                }`}
              />
              <span
                className={`w-[18px] h-[2px] bg-white rounded-full transition-all duration-300 ${
                  open ? "-translate-y-[3.5px] -rotate-45" : ""
                }`}
              />
            </div>
          </button>
        </div>
      </nav>

      {/* Full-screen navigation overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40 flex items-center px-6 md:px-12 lg:px-20 backdrop-blur-2xl"
            style={{ background: "rgba(245,243,242,0.94)" }}
          >
            <ul className="w-full max-w-7xl mx-auto flex flex-col gap-2 md:gap-4">
              {NAV_LINKS.map((link, i) => (
                <motion.li
                  key={link.label}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{
                    duration: 0.6,
                    delay: 0.08 * i,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {away ? (
                    <Link
                      href={`/${link.target}`}
                      onClick={() => setOpen(false)}
                      className="group flex items-baseline gap-5 md:gap-8"
                    >
                      <span className="text-brand-purple text-[10px] md:text-xs tracking-[0.3em] font-medium">
                        {link.index}
                      </span>
                      <span className="font-serif text-brand-text text-[clamp(40px,8vw,110px)] leading-[1.05] tracking-[-0.03em] group-hover:text-brand-purple-soft transition-colors duration-500">
                        {link.label}
                      </span>
                    </Link>
                  ) : (
                    <a
                      href={link.target}
                      onClick={(e) => handleNavClick(e, link.target)}
                      className="group flex items-baseline gap-5 md:gap-8"
                    >
                      <span className="text-brand-purple text-[10px] md:text-xs tracking-[0.3em] font-medium">
                        {link.index}
                      </span>
                      <span className="font-serif text-brand-text text-[clamp(40px,8vw,110px)] leading-[1.05] tracking-[-0.03em] group-hover:text-brand-purple-soft transition-colors duration-500">
                        {link.label}
                      </span>
                    </a>
                  )}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
