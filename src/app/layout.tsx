import type { Metadata } from "next";
import "@fontsource-variable/ibm-plex-sans";
import "./report.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Thesis | Investment research",
  description: "An evidence-first workspace for stock research. Explore the bull case, the bear case, and the reasoning behind the conclusion.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
