/**
 * The company's real contact details, in one place.
 *
 * `lib/satellites.ts` already states the rule this file exists to keep: having
 * an address in two places is having it wrong in one of them eventually. The
 * details now appear on the footer plate, on the CONTACT US stop's drops and in
 * the three contact pages' copy, so "one place" has to be a module rather than
 * a convention about which component owns it.
 *
 * Display strings and href strings are both held here because they differ, and
 * the difference is exactly the kind of thing that rots when it is derived at
 * the call site: `tel:` wants no spaces, the line a reader sees wants them.
 */
export const CONTACT = {
  email: "contact@crovion.com",
  /** `mailto:` target. Same string as `email` today; named separately so a
   *  future routing alias does not have to be visible in the copy. */
  emailHref: "mailto:contact@crovion.com",

  /** As set on the page — grouped the way the number is read aloud. */
  phone: "+91 82659 17894",
  /** `tel:` target. E.164, no spaces: a dialler is not a reader. */
  phoneHref: "tel:+918265917894",

  /** The studio address, one line per line of the postal address. */
  address: [
    "118-B/3, First Floor",
    "Shahpur Jat",
    "New Delhi – 110049",
  ] as const,
  /** The same address run together, for a single-line setting. */
  addressLine: "118-B/3, First Floor, Shahpur Jat, New Delhi – 110049",

  /** Public social profiles. Kept here for the same reason the address is:
   *  a handle written into a component is a handle nobody remembers to change.
   *  Channels the studio does not run yet are simply absent — a live link is
   *  the only thing worth rendering as one. */
  social: {
    instagram: "https://www.instagram.com/crovionofficial/",
    /** The company page itself, not the `/posts/?feedView=all` tab a browser
     *  hands you when you copy the URL while reading the feed — a footer link
     *  should land on the profile, and the tab is one click from there. */
    linkedin: "https://www.linkedin.com/company/crovionofficial/",
  },
} as const;
