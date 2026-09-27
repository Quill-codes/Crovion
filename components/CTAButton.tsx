"use client";

import { motion, useSpring, useMotionValue } from "framer-motion";

interface CTAButtonProps {
  text?: string;
  /**
   * Optional second line. Omitted, the button carries one line and stays
   * centred on it — the wrapper is a centred flex column, so nothing has to
   * change for a one-word label.
   */
  subtext?: string;
  onClick?: () => void;
  size?: number;
  /**
   * This button's disclosure is open — it drives `aria-expanded` only.
   *
   * Left undefined the attribute is omitted entirely, which is the correct
   * markup for a button that discloses nothing. It is set where the button
   * opens the head sphere's service fan; see the use site in `HeroCanvas`.
   */
  expanded?: boolean;
  /**
   * Overrides the accessible name, which otherwise falls out of the two lines
   * of visible copy. Worth setting when the button *does* something the copy
   * does not state — "Open Our Services" against a face that reads "OUR
   * SERVICES".
   */
  ariaLabel?: string;
}

export default function CTAButton({
  text = "PORTFOLIO",
  subtext,
  onClick,
  size = 120,
  expanded,
  ariaLabel,
}: CTAButtonProps) {
  const scale = useMotionValue(1);
  const smoothScale = useSpring(scale, { damping: 20, stiffness: 300 });

  return (
    <div className="relative flex flex-col items-center">
      {/* Main red circle button */}
      <motion.button
        onClick={onClick}
        style={{ scale: smoothScale, width: size, height: size }}
        onHoverStart={() => scale.set(1.06)}
        onHoverEnd={() => scale.set(1)}
        onTapStart={() => scale.set(0.95)}
        onTap={() => scale.set(1.06)}
        className="relative flex flex-col items-center justify-center rounded-full cursor-pointer border-none outline-none group"
        aria-label={ariaLabel ?? [text, subtext].filter(Boolean).join(" ")}
        aria-expanded={expanded}
      >
        {/* Glass ring border — like Bravis */}
        <div className="absolute inset-[-6px] rounded-full border border-brand-text/[0.10] group-hover:border-brand-text/[0.20] transition-colors duration-500" />

        {/* Red fill */}
        <div className="absolute inset-0 rounded-full bg-brand-accent group-hover:bg-brand-accent-hover transition-colors duration-500" />

        {/* Text */}
        <span className="relative z-10 text-white text-[11px] md:text-[12px] font-semibold tracking-[0.2em] uppercase leading-snug">
          {text}
        </span>
        {subtext && (
          <span className="relative z-10 text-white text-[11px] md:text-[12px] font-semibold tracking-[0.2em] uppercase leading-snug">
            {subtext}
          </span>
        )}
      </motion.button>

      {/* White arrow circle below — reference style.
          Solid white rather than a translucent tint: on a light ground a 10 %
          wash has nothing to sit against, so the circle reads through its own
          fill and shadow instead of through contrast with the page. */}
      <motion.div
        className="mt-[-8px] w-8 h-8 rounded-full bg-white border border-brand-text/[0.08] shadow-[0_2px_10px_rgba(20,19,26,0.12)] flex items-center justify-center cursor-pointer z-10"
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
        >
          <path
            d="M2 5H8M8 5L5.5 2.5M8 5L5.5 7.5"
            stroke="#6D4AFF"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.div>
    </div>
  );
}
