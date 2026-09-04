import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { log } from "../util/log.js";

/**
 * Two of the three extraction ladders end here. Every jurisdiction runs a
 * different CMS and the pipeline cannot ship a hand-written selector for each,
 * so pages with no structured data are read by the model instead. The prompts
 * below are deliberately strict about omission: a missing field is correct, an
 * invented one poisons the dataset.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!config.anthropicKey) return null;
  client ??= new Anthropic({ apiKey: config.anthropicKey });
  return client;
}

export function llmAvailable(): boolean {
  return Boolean(config.anthropicKey);
}

const NO_INVENTION = `
Rules:
- Copy values verbatim from the page. Never normalise, complete, or guess.
- If a field does not appear on the page, omit it. An omitted field is correct;
  an invented one is a defect.
- Ignore navigation, donation banners, and unrelated organisations.
- Return ONLY the JSON array, with no prose and no markdown fence.`;

async function extractJson<T>(prompt: string, text: string, hard = false): Promise<T[]> {
  const anthropic = getClient();
  if (!anthropic) {
    log.warn("LLM extraction requested but ANTHROPIC_API_KEY is unset; skipping");
    return [];
  }
  try {
    const res = await anthropic.messages.create({
      model: hard ? config.llmModelHard : config.llmModel,
      max_tokens: 8000,
      temperature: 0,
      system: prompt,
      messages: [{ role: "user", content: text }],
    });
    const body = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed: unknown = JSON.parse(body);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    log.warn("LLM extraction failed", (err as Error).message);
    return [];
  }
}

export interface LlmParish {
  name: string;
  addressText?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  website?: string;
  status?: string;
  clergy?: string[];
}

export function extractParishes(pageText: string, jurisdictionName: string, hard = false) {
  const prompt = `You are reading a page from ${jurisdictionName}, a US Christian jurisdiction, to pull out its list of parishes.

Return a JSON array. Each element:
{"name": string, "addressText"?: string, "city"?: string, "state"?: two-letter code,
 "phone"?: string, "email"?: string, "website"?: string,
 "status"?: "parish"|"mission"|"cathedral"|"monastery"|"chapel", "clergy"?: string[]}

Only include congregations located in the United States. Links appear inline as
<https://...> after the text they belong to; use those for "website" when the
link clearly belongs to that parish rather than to the jurisdiction itself.
${NO_INVENTION}`;
  return extractJson<LlmParish>(prompt, pageText, hard);
}

export interface LlmEvent {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  url?: string;
}

export function extractEvents(pageText: string, parishName: string, today: string, hard = false) {
  const prompt = `You are reading a page from ${parishName}, a US parish, to pull out its upcoming events.

Today is ${today}. Return a JSON array. Each element:
{"title": string, "start": ISO 8601 datetime or date, "end"?: ISO 8601,
 "allDay"?: boolean, "description"?: string, "location"?: string, "url"?: string}

- Include one-off events and dated announcements. Skip the standing weekly
  service schedule; that is captured separately.
- Resolve relative dates ("this Sunday", "Dec 7") against today's date. If a
  year is absent, choose the next occurrence at or after today.
- If a date cannot be resolved with confidence, omit the event entirely.
${NO_INVENTION}`;
  return extractJson<LlmEvent>(prompt, pageText, hard);
}

export interface LlmServiceTimes {
  label: string;
  dayOfWeek?: number;
  time?: string;
  language?: string;
  note?: string;
}

export function extractServiceTimes(pageText: string, parishName: string) {
  const prompt = `You are reading a page from ${parishName}, a US parish, to pull out its recurring service schedule.

Return a JSON array. Each element:
{"label": string (e.g. "Divine Liturgy", "Qurbono", "Orthros", "Tasbeha"),
 "dayOfWeek"?: 0-6 with 0=Sunday, "time"?: "HH:MM" 24-hour,
 "language"?: string, "note"?: string}

Capture the recurring schedule only, not one-off events.
${NO_INVENTION}`;
  return extractJson<LlmServiceTimes>(prompt, pageText);
}
