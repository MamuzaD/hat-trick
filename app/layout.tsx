import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Pixelify_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

/** Display only: title and the big percentages. */
const pixel = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
});

/** Everything else. */
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "hat trick",
  description: "Live, rigorous odds of winning the thinking hat.",
};

export const viewport: Viewport = {
  themeColor: "#0f1622",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased", pixel.variable, mono.variable)}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
