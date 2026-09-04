import Link from "next/link";

export const metadata = { title: "Submit a correction" };

export default function SubmitPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="serif text-2xl font-semibold tracking-tight">Submit a parish, event, or correction</h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
          Automated collection reaches the parishes that publish machine-readable calendars. For
          everyone else, this is the path in.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <h2 className="serif text-lg font-semibold">How submissions work</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink-soft)]">
          <li>
            A submission is appended to{" "}
            <code className="rounded bg-[var(--color-ink)]/6 px-1">data/submissions.json</code> with{" "}
            <code className="rounded bg-[var(--color-ink)]/6 px-1">approved: false</code>.
          </li>
          <li>A moderator reviews it and flips that flag.</li>
          <li>
            The next <code className="rounded bg-[var(--color-ink)]/6 px-1">npm run events</code> run
            picks it up. Submissions for parishes not already in the dataset are rejected, so the
            form cannot inject arbitrary records.
          </li>
        </ol>
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
          The form itself needs a backend that can write that file (a route handler, a serverless
          function, or a GitHub issue-to-PR bot). This build ships static, so wire up whichever
          suits your deployment and post the shape below to it.
        </p>
      </section>

      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <h2 className="serif text-lg font-semibold">Submission shape</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-[var(--color-ink)]/5 p-3 text-xs">
{`{
  "parishId": "coptic-orthodox-nj-mary-jersey-city",
  "title": "Feast of the Nativity Liturgy",
  "start": "2026-01-06T22:00:00-05:00",
  "end": "2026-01-07T01:00:00-05:00",
  "allDay": false,
  "description": "Vigil and Divine Liturgy.",
  "location": "Main church",
  "url": "https://example.org/events/nativity",
  "submittedBy": "parish office",
  "submittedAt": "2026-09-04T12:00:00Z",
  "approved": false
}`}
        </pre>
      </section>

      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <h2 className="serif text-lg font-semibold">Parish staff: connect your Facebook Page</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          If your parish posts events to Facebook, granting the directory&rsquo;s Meta app access to
          your Page lets events sync automatically. That grant is made by a Page admin through Meta,
          and can be revoked at any time. Reading a Page without it is against Meta&rsquo;s terms,
          so nothing is collected until you opt in.
        </p>
      </section>

      <p className="text-sm">
        <Link href="/" className="underline">← Back to the directory</Link>
      </p>
    </div>
  );
}
