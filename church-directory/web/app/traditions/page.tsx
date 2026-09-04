import Link from "next/link";
import { getRegistry, getTraditionSummaries, getDataset } from "@/lib/data";
import { TRADITION_COLORS } from "@/lib/format";

export const metadata = { title: "Traditions and jurisdictions" };

export default function TraditionsPage() {
  const summaries = getTraditionSummaries();
  const registry = getRegistry();
  const { parishes } = getDataset();

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="serif text-2xl font-semibold tracking-tight">Traditions and jurisdictions</h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
          Coverage against the number of US parishes each tradition is reported to have. A gap here
          means the crawler has not reached that jurisdiction&rsquo;s directory yet, not that the
          parishes do not exist.
        </p>
      </div>

      {summaries.map((t) => {
        const jurisdictions = registry.jurisdictions.filter((j) => j.tradition === t.id);
        const pct = t.estimated ? Math.min(100, Math.round((t.parishes / t.estimated) * 100)) : 0;

        return (
          <section key={t.id} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: TRADITION_COLORS[t.id] }} />
              <h2 className="serif text-lg font-semibold">{t.name}</h2>
              <span className="text-sm text-[var(--color-ink-soft)]">{t.rite} rite · {t.family}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--color-ink-soft)]">
              <span><strong className="text-[var(--color-ink)]">{t.parishes}</strong> in dataset</span>
              <span>~{t.estimated} reported nationally</span>
              <span><strong className="text-[var(--color-ink)]">{t.socials}</strong> social accounts</span>
              <span><strong className="text-[var(--color-ink)]">{t.events}</strong> events</span>
            </div>

            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-ink)]/8"
              role="img"
              aria-label={`${pct}% of estimated parishes collected`}
            >
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TRADITION_COLORS[t.id] }} />
            </div>

            <ul className="mt-4 space-y-1.5 text-sm">
              {jurisdictions.map((j) => {
                const count = parishes.filter((p) => p.jurisdictionId === j.id).length;
                return (
                  <li key={j.id} className="flex flex-wrap items-baseline gap-x-2">
                    <a href={j.site} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {j.name}
                    </a>
                    <span className="text-xs text-[var(--color-ink-faint)]">
                      {count} parishes
                      {j.territory && ` · ${j.territory}`}
                    </span>
                    {j.confidence !== "verified" && (
                      <span
                        className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-500"
                        title="This directory URL was inferred rather than confirmed; the pipeline reports whether it resolved."
                      >
                        {j.confidence} URL
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="text-sm text-[var(--color-ink-soft)]">
        Missing a jurisdiction? <Link href="/submit" className="underline">Tell us</Link>, or add it to{" "}
        <code className="rounded bg-[var(--color-ink)]/6 px-1">data/jurisdictions.json</code>.
      </p>
    </div>
  );
}
