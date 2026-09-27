/**
 * The shape of what the backend serves and the site falls back to.
 *
 * Deliberately *not* the shape of the backend's database: geometry — every
 * drop's offset, radius and the chain's world positions and tints — never
 * crosses this boundary. Those values are collision-checked against their
 * neighbours and, in 03's case, pre-compensated for the composite's tone
 * mapping, and none of that survives a round trip through a text field.
 *
 * So what arrives is copy, and the site zips it against its own tuned geometry
 * *by index*: drop 0 in this array takes slot 0 on that parent's arc. Array
 * order is placement on screen, which is why the admin's reorder buttons are the
 * only positioning control it offers.
 */
export interface RemoteDrop {
  id: string;
  mark: string;
  label: string;
  detail: string;
  /** `form` swaps the drop's detail line for the contact form. */
  kind: "detail" | "form";
}

export interface RemoteStop {
  /** "00" is the head sphere; "01"…"03" are the numbered stops. */
  key: string;
  line1: string;
  line2: string;
  drops: RemoteDrop[];
}

export interface SiteContent {
  updatedAt: string;
  stops: RemoteStop[];
}
