import type { Metadata } from "next";
import { Varela_Round, Comfortaa, Fira_Code } from "next/font/google";
import "./globals.css";

const display = Varela_Round({
  weight: "400",
  subsets: ["latin"],
  variable: "--nf-display",
});
const body = Comfortaa({ subsets: ["latin"], variable: "--nf-body" });
const mono = Fira_Code({ subsets: ["latin"], variable: "--nf-mono" });

export const metadata: Metadata = {
  title: "Web Synth",
  description:
    "A hybrid paraphonic synthesizer in the browser — Minimoog Model D voice, Korg Mono/Poly performance brain.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
