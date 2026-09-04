import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getDataset } from "@/lib/data";

export const metadata: Metadata = {
  title: {
    default: "Eastern Christian Churches in the United States",
    template: "%s · Eastern Churches",
  },
  description:
    "A directory of Maronite, Chaldean, Melkite, Greek Orthodox, Coptic Orthodox, Syriac Orthodox and Assyrian Church of the East parishes in the US, with their social accounts and upcoming events.",
};

const NAV = [
  { href: "/", label: "Directory" },
  { href: "/events", label: "Events" },
  { href: "/traditions", label: "Traditions" },
  { href: "/submit", label: "Submit" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { isDemo, generatedAt, counts } = getDataset();

  return (
    <html lang="en">
      <body className="min-h-screen">
        {isDemo && (
          <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
            Demonstration data. Every parish and event below is invented. Run{" "}
            <code className="rounded bg-amber-950/15 px-1">npm run refresh</code> to replace it with the real directory.
          </div>
        )}

        <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
            <Link href="/" className="serif text-lg font-semibold tracking-tight">
              Eastern Churches <span className="text-[var(--color-ink-faint)]">· US</span>
            </Link>
            <nav className="flex gap-5 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-accent)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto text-xs text-[var(--color-ink-faint)]">
              {counts.parishes.toLocaleString()} parishes · {counts.events.toLocaleString()} events
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

        <footer className="mt-16 border-t border-[var(--color-line)] px-4 py-8 text-xs text-[var(--color-ink-faint)]">
          <div className="mx-auto max-w-7xl space-y-1">
            <p>
              Compiled from official eparchy and archdiocese directories, parish websites, and OpenStreetMap.
              Dataset generated {new Date(generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}.
            </p>
            <p>
              Coverage is incomplete and every record carries its source. Corrections welcome via{" "}
              <Link href="/submit" className="underline">the submission form</Link>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
