import Link from "next/link";
import { notFound } from "next/navigation";
import SocialLinks from "@/components/SocialLinks";
import EventList from "@/components/EventList";
import { getDataset, getParish, getParishEvents, getRegistry } from "@/lib/data";
import { TRADITION_COLORS, dayName, formatTime } from "@/lib/format";

export function generateStaticParams() {
  return getDataset().parishes.map((p) => ({ slug: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const parish = getParish((await params).slug);
  if (!parish) return { title: "Parish not found" };
  const where = parish.address?.city ? ` — ${parish.address.city}, ${parish.address.state}` : "";
  return { title: `${parish.name}${where}` };
}

export default async function ParishPage({ params }: { params: Promise<{ slug: string }> }) {
  const parish = getParish((await params).slug);
  if (!parish) notFound();

  const events = getParishEvents(parish.id);
  const registry = getRegistry();
  const tradition = registry.traditions.find((t) => t.id === parish.tradition);
  const jurisdiction = registry.jurisdictions.find((j) => j.id === parish.jurisdictionId);

  return (
    <article className="space-y-8">
      <Link href="/" className="text-sm text-[var(--color-ink-soft)] hover:underline">
        ← Directory
      </Link>

      <header>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full"
            style={{ background: TRADITION_COLORS[parish.tradition] }}
          />
          <span className="text-sm text-[var(--color-ink-soft)]">
            {tradition?.name ?? parish.tradition}
            {tradition && <> · {tradition.rite} rite · {tradition.family}</>}
          </span>
        </div>

        <h1 className="serif mt-1.5 text-2xl font-semibold tracking-tight">{parish.name}</h1>
        {parish.alternateNames.length > 0 && (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Also listed as: {parish.alternateNames.join(" · ")}
          </p>
        )}

        {jurisdiction && (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            <a
              href={jurisdiction.site}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted"
            >
              {jurisdiction.name}
            </a>
            {parish.subJurisdiction && ` · ${parish.subJurisdiction}`}
          </p>
        )}
      </header>

      <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <Section title={`Events (${events.length})`}>
            <EventList
              events={events}
              empty="No upcoming events found. The parish may publish them only on social media, or on a page the crawler could not read."
            />
          </Section>

          {parish.serviceTimes.length > 0 && (
            <Section title="Regular services">
              <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
                {parish.serviceTimes.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm">
                    <span className="font-medium">{s.label}</span>
                    <span className="text-[var(--color-ink-soft)]">
                      {[dayName(s.dayOfWeek), formatTime(s.time)].filter(Boolean).join(" ")}
                    </span>
                    {s.language && (
                      <span className="text-xs text-[var(--color-ink-faint)]">{s.language}</span>
                    )}
                    {s.note && <span className="text-xs text-[var(--color-ink-faint)]">{s.note}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="space-y-8">
          <Section title="Social">
            <SocialLinks socials={parish.socials} />
          </Section>

          <Section title="Contact">
            <dl className="space-y-2 text-sm">
              {parish.address && (
                <Row label="Address">
                  {[parish.address.street, parish.address.city && `${parish.address.city},`, parish.address.state, parish.address.postalCode]
                    .filter(Boolean)
                    .join(" ")}
                </Row>
              )}
              {parish.phone && (
                <Row label="Phone">
                  <a href={`tel:${parish.phone.replace(/\D/g, "")}`} className="hover:underline">
                    {parish.phone}
                  </a>
                </Row>
              )}
              {parish.email && (
                <Row label="Email">
                  <a href={`mailto:${parish.email}`} className="hover:underline">{parish.email}</a>
                </Row>
              )}
              {parish.website && (
                <Row label="Website">
                  <a
                    href={parish.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all hover:underline"
                  >
                    {parish.website.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                </Row>
              )}
              {parish.languages.length > 0 && <Row label="Languages">{parish.languages.join(", ")}</Row>}
              {parish.clergy.length > 0 && (
                <Row label="Clergy">
                  {parish.clergy.map((c) => [c.title, c.name].filter(Boolean).join(" ")).join(", ")}
                </Row>
              )}
              {parish.coordinates && (
                <Row label="Map">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${parish.coordinates.lat}&mlon=${parish.coordinates.lon}#map=17/${parish.coordinates.lat}/${parish.coordinates.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {parish.coordinates.lat.toFixed(4)}, {parish.coordinates.lon.toFixed(4)}
                  </a>
                </Row>
              )}
            </dl>
          </Section>

          <Section title="Where this came from">
            <ul className="space-y-1.5 text-xs text-[var(--color-ink-faint)]">
              {parish.provenance.slice(-6).map((p, i) => (
                <li key={i}>
                  <span className="text-[var(--color-ink-soft)]">{p.method}</span> via {p.source}
                  {p.url && (
                    <>
                      {" · "}
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">
                        source
                      </a>
                    </>
                  )}
                  <> · {new Date(p.fetchedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</>
                </li>
              ))}
            </ul>
            {parish.flags.length > 0 && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-500">
                Flagged: {parish.flags.join(", ")}
              </p>
            )}
            <p className="mt-3 text-xs">
              <Link href="/submit" className="underline">Something wrong? Send a correction.</Link>
            </p>
          </Section>
        </aside>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="serif mb-2.5 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-[var(--color-ink-faint)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
