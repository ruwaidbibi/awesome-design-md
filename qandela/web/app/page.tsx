import DirectoryExplorer from "@/components/DirectoryExplorer";
import { getParishSummaries, getTraditionSummaries } from "@/lib/data";

export default function HomePage() {
  const parishes = getParishSummaries();
  const traditions = getTraditionSummaries()
    .filter((t) => t.parishes > 0)
    .map((t) => ({ id: t.id, name: t.name, parishes: t.parishes }));

  return (
    <div className="space-y-5">
      <div className="max-w-2xl">
        <h1 className="serif text-2xl font-semibold tracking-tight">
          Eastern Christian parishes in the United States
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
          Maronite, Chaldean, Melkite, Greek Orthodox, Coptic Orthodox, Syriac Orthodox and Assyrian
          Church of the East congregations, with the social accounts and upcoming events found on
          their own websites.
        </p>
      </div>

      {parishes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] p-8 text-sm text-[var(--color-ink-soft)]">
          <p className="font-medium text-[var(--color-ink)]">No parishes in the dataset yet.</p>
          <p className="mt-2">
            Run the pipeline to populate it:
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-[var(--color-ink)]/5 p-3 text-xs">
{`cd qandela
npm install
cp .env.example .env    # add ANTHROPIC_API_KEY for the LLM fallback
npm run refresh`}
          </pre>
        </div>
      ) : (
        <DirectoryExplorer parishes={parishes} traditions={traditions} />
      )}
    </div>
  );
}
