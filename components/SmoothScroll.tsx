"use client";

import { LenisProvider } from "@/hooks/useLenis";

export default function SmoothScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LenisProvider>{children}</LenisProvider>;
}
