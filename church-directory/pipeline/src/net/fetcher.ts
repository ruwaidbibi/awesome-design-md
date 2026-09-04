import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import robotsParser, { type Robot } from "robots-parser";
import { CACHE_DIR, config } from "../config.js";
import { log } from "../util/log.js";

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  body: string;
  contentType: string;
  fromCache: boolean;
  fetchedAt: string;
}

const lastHit = new Map<string, number>();
const robotsCache = new Map<string, Robot | null>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cachePath(url: string) {
  const hash = createHash("sha256").update(url).digest("hex");
  return join(CACHE_DIR, hash.slice(0, 2), `${hash}.json`);
}

function readCache(url: string): FetchResult | null {
  const path = cachePath(url);
  if (!existsSync(path)) return null;
  const ageHours = (Date.now() - statSync(path).mtimeMs) / 36e5;
  if (ageHours > config.cacheTtlHours) return null;
  try {
    return { ...(JSON.parse(readFileSync(path, "utf8")) as FetchResult), fromCache: true };
  } catch {
    return null;
  }
}

function writeCache(url: string, result: FetchResult) {
  const path = cachePath(url);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(result));
}

/**
 * robots.txt is honoured for every host. Church sites are run by volunteers;
 * a crawler that ignores their rules is the fastest way to get the project
 * blocked, and the data is not worth that.
 */
async function robotsFor(origin: string): Promise<Robot | null> {
  if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;
  let robot: Robot | null = null;
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": config.userAgent },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) robot = robotsParser(`${origin}/robots.txt`, await res.text());
  } catch {
    // No robots.txt, or unreachable: treat as permissive, which is the
    // standard interpretation.
  }
  robotsCache.set(origin, robot);
  return robot;
}

export async function isAllowed(url: string): Promise<boolean> {
  try {
    const origin = new URL(url).origin;
    const robot = await robotsFor(origin);
    return robot ? robot.isAllowed(url, config.userAgent) !== false : true;
  } catch {
    return false;
  }
}

async function throttle(host: string) {
  const last = lastHit.get(host) ?? 0;
  const wait = config.delayMs - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

export interface FetchOptions {
  /** Skip the on-disk cache for this call. */
  fresh?: boolean;
  /** Bypass robots.txt. Only for URLs the site owner handed you directly. */
  ignoreRobots?: boolean;
  accept?: string;
  timeoutMs?: number;
  retries?: number;
}

export async function fetchUrl(url: string, opts: FetchOptions = {}): Promise<FetchResult | null> {
  if (!opts.fresh) {
    const cached = readCache(url);
    if (cached) return cached;
  }
  if (!opts.ignoreRobots && !(await isAllowed(url))) {
    log.warn(`robots.txt disallows ${url}`);
    return null;
  }

  const host = new URL(url).host;
  const retries = opts.retries ?? 2;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(host);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": config.userAgent,
          accept: opts.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });

      // 429 and 5xx are worth backing off for; 4xx is a real answer.
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const backoff = 2000 * 2 ** attempt;
          log.warn(`${res.status} on ${url}, backing off ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
      }

      const result: FetchResult = {
        url,
        finalUrl: res.url || url,
        status: res.status,
        body: res.ok ? await res.text() : "",
        contentType: res.headers.get("content-type") ?? "",
        fromCache: false,
        fetchedAt: new Date().toISOString(),
      };
      if (res.ok) writeCache(url, result);
      return result;
    } catch (err) {
      if (attempt >= retries) {
        log.warn(`fetch failed ${url}`, (err as Error).message);
        return null;
      }
      await sleep(2000 * 2 ** attempt);
    }
  }
  return null;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T | null> {
  const res = await fetchUrl(url, { ...opts, accept: "application/json" });
  if (!res || !res.body) return null;
  try {
    return JSON.parse(res.body) as T;
  } catch {
    return null;
  }
}
