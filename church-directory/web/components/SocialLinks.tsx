import type { SocialAccount } from "@/lib/types";

const LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  linkedin: "LinkedIn",
  flickr: "Flickr",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  podcast: "Podcast",
};

export default function SocialLinks({ socials }: { socials: SocialAccount[] }) {
  if (!socials.length) {
    return (
      <p className="text-sm text-[var(--color-ink-faint)]">
        No social accounts found on this parish&rsquo;s website.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {socials.map((s) => (
        <li key={`${s.platform}-${s.url}`}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-baseline gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm transition-colors hover:border-[var(--color-accent)]"
          >
            <span className="font-medium">{LABELS[s.platform] ?? s.platform}</span>
            {s.handle && <span className="text-xs text-[var(--color-ink-faint)]">@{s.handle}</span>}
            {s.followers !== undefined && (
              <span className="text-xs text-[var(--color-ink-faint)]">
                {s.followers.toLocaleString()} followers
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
