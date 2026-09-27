import type { Metadata } from "next";
import { Outfit, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Crovion",
  description:
    "Crovion is a premium digital branding agency. Strategy, Creative & Digital — we build brands that define the future.",
  keywords: [
    "branding",
    "digital agency",
    "creative studio",
    "web design",
    "strategy",
  ],
  openGraph: {
    title: "Crovion",
    description: "Strategy / Creative / &Digital",
    siteName: "Crovion",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${dmSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans bg-brand-bg text-brand-text min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
