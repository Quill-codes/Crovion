"use client";

import { useCallback } from "react";
import { create } from "zustand";
import { BACKEND_URL } from "./config";
import type { RemoteStop, SiteContent } from "./types";
import { SATELLITES, type SatelliteNode } from "@/lib/satellites";

/**
 * The site's copy, when a backend is serving it.
 *
 * `null` is the normal, supported state — not an error and not a loading
 * screen. The site ships with its whole content tree hardcoded (`SATELLITES`,
 * and the chain table in `HeroCanvas`), and that is what renders until and
 * unless this store is filled. A backend that is not running, is unreachable, or
 * returns something malformed all land in the same place: the built-in copy,
 * with nothing on screen to say so.
 *
 * That is the point of the arrangement. The site is a standalone WebGL page that
 * has to build and deploy without a service behind it; the backend makes the
 * copy editable when it is there.
 */
interface ContentState {
  content: SiteContent | null;
  /** `unavailable` means we tried and the backend was not there. */
  status: "idle" | "loading" | "ready" | "unavailable";
}

export const useContentStore = create<ContentState>(() => ({
  content: null,
  status: "idle",
}));

/**
 * Fetch once per page load.
 *
 * Guarded on `idle` rather than on a ref in a component, because two components
 * mount-and-fetch independently in React StrictMode's double mount and the guard
 * has to outlive both. The abort timeout is short on purpose: this is decoration
 * on a page that already renders correctly without it, so it must never be the
 * reason the copy takes three seconds to appear.
 */
export async function hydrateContent(): Promise<void> {
  if (!BACKEND_URL) return;
  if (useContentStore.getState().status !== "idle") return;
  useContentStore.setState({ status: "loading" });

  try {
    const res = await fetch(`${BACKEND_URL}/api/content`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as SiteContent;
    // Shape-checked before it is trusted: this is a separate process that can be
    // any version of itself, and a malformed tree reaching the render is a blank
    // sphere chain rather than a caught error.
    if (!data || !Array.isArray(data.stops)) throw new Error("malformed payload");

    useContentStore.setState({ content: data, status: "ready" });
  } catch (err) {
    // Logged, not thrown, and never surfaced: see the note on `null` above.
    if (process.env.NODE_ENV === "development") {
      console.info("[crovion] content backend unavailable — using built-in copy.", err);
    }
    useContentStore.setState({ status: "unavailable" });
  }
}

function remoteStop(content: SiteContent | null, key: string): RemoteStop | undefined {
  return content?.stops.find((s) => s.key === key);
}

/**
 * A resolver for the two-line name on a numbered stop's card.
 *
 * A function rather than a hook-per-label, because the caller maps over the
 * chain and a hook cannot be called inside that loop. It takes the built-in
 * label as its argument rather than reading one out of a table here, so the
 * fallback copy stays where it is authored — in the chain table itself, next to
 * the sphere it names.
 *
 * The number is never resolved. It is structural: it identifies the stop, keys
 * its satellite fan, and is what the backend files its own row under, so a card
 * that could renumber itself would be a card that could lose its drops.
 */
export type StopLabel = { number: string; line1: string; line2: string };

export function useLabelResolver(): (fallback: StopLabel) => StopLabel {
  const content = useContentStore((s) => s.content);
  return useCallback(
    (fallback: StopLabel) => {
      const stop = remoteStop(content, fallback.number);
      if (!stop) return fallback;
      return { number: fallback.number, line1: stop.line1, line2: stop.line2 };
    },
    [content]
  );
}

/**
 * A parent's drops, with remote copy laid over local geometry.
 *
 * The zip is by index and the local table is the authority on length: a backend
 * offering more drops than this parent has placed positions has them dropped
 * here rather than stacked on top of each other at the last offset. The admin
 * enforces the same cap on the way in — this is the second of the two, and it is
 * the one that holds when the two processes disagree about their versions.
 *
 * There is no third level any more. It used to be zipped in from the local slot
 * alongside `offset` and `radius`, because a leaf drop was as much geometry as
 * copy and nothing in the payload could carry a solved position. The whole level
 * is gone — see the note at the top of `lib/satellites.ts` — so the zip is now
 * exactly the four copy fields over the two geometry ones, which is the shape the
 * API always described.
 *
 * The id comes from the payload, not the slot, and it carries two jobs beyond
 * identity: `ContactForm` files a lead under it, and `detailHref` looks a page up
 * by it. A backend that renames an id therefore detaches that drop's page, and
 * the drop loses its control rather than growing a broken one — the degradation
 * `detailHref` returning `null` is there to produce.
 */
export function useDrops(parent: string): SatelliteNode[] {
  const content = useContentStore((s) => s.content);
  const local = SATELLITES[parent];
  if (!local) return [];

  const stop = remoteStop(content, parent);
  if (!stop || stop.drops.length === 0) return local;

  return stop.drops.slice(0, local.length).map((d, i) => ({
    id: d.id,
    mark: d.mark,
    // By id, not by slot: the picture belongs to the drop, and an admin reorder
    // moves the drop to another slot without moving its logo onto a neighbour.
    image: local.find((n) => n.id === d.id)?.image,
    label: d.label,
    detail: d.detail,
    kind: d.kind === "form" ? "form" : "detail",
    offset: local[i].offset,
    radius: local[i].radius,
  }));
}
