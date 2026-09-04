import type { ChurchEvent } from "../schema.js";

type Category = ChurchEvent["category"];

/**
 * Keyword buckets, ordered most-specific first. These are deliberately
 * multi-tradition: a Coptic "Tasbeha", a Syriac "Qurbono", a Greek "Orthros"
 * and a Maronite "Qurbono" are all liturgy, and the UI should say so.
 */
const RULES: [Category, RegExp][] = [
  ["liturgy", /\b(liturgy|qurbana|qurbono|raze|divine liturgy|orthros|matins|vespers|hesperinos|compline|tasbeha|midnight praises|holy mass|badarak|paraklesis|akathist|salutations|presanctified|agpeya|hours|confession|adoration)\b/i],
  ["feast", /\b(feast|nativity|theophany|epiphany|pascha|easter|holy week|great lent|nineveh|assumption|dormition|annunciation|transfiguration|pentecost|palm sunday|good friday|christmas|resurrection|patron saint|name day|panegyri)\b/i],
  ["festival", /\b(festival|glendi|hafli|mahrajan|bazaar|food fest|greek fest|coptic fest|lebanese fest|assyrian new year|akitu|nowruz|carnival)\b/i],
  ["fundraiser", /\b(fundrais|gala|banquet|raffle|auction|golf outing|dinner dance|benefit|donation drive|stewardship)\b/i],
  ["youth", /\b(youth|teen|young adult|goya|jr\.? goya|hope\/joy|sunday school|servants|scouts|junior|altar boys|acolyte|camp)\b/i],
  ["education", /\b(bible study|catechism|class|lecture|seminar|workshop|study group|school of|arabic school|greek school|syriac class|language class|conference)\b/i],
  ["retreat", /\b(retreat|pilgrimage|monastery visit|spiritual day|quiet day)\b/i],
  ["music", /\b(choir|chant|byzantine music|hymn|concert|recital|psaltry|psalti|deacon practice|alhan)\b/i],
  ["community", /\b(coffee hour|fellowship|picnic|potluck|general assembly|parish council|meeting|clean.?up|volunteer|blood drive|social)\b/i],
];

export function categorize(title: string, description?: string): Category {
  const haystack = `${title} ${description ?? ""}`;
  for (const [category, re] of RULES) if (re.test(haystack)) return category;
  return "other";
}
