import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Devanagari } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import { InlineScript, PREPAINT_SCRIPT } from "@/components/shell/inline-script";
import { IntlRoot } from "@/components/shell/intl-root";
import { LogoMark } from "@/components/shell/logo";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Devanagari glyphs for Hindi and Marathi; not preloaded, so English-only pages don't download it.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-deva",
  subsets: ["devanagari"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "NextChapter — study companion", template: "%s · NextChapter" },
  description:
    "An AI study companion for Indian school, college and competitive-exam students: syllabus roadmaps, source-linked learning, planning, reflection and career growth.",
  applicationName: "NextChapter",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1513" },
  ],
};

function BootSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3" role="status">
      <LogoMark className="size-10 animate-pulse" />
      <span className="sr-only">Loading NextChapter…</span>
    </div>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${devanagari.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={PREPAINT_SCRIPT} />
      </head>
      <body className="min-h-full">
        <Suspense fallback={<BootSplash />}>
          <IntlRoot>{children}</IntlRoot>
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
