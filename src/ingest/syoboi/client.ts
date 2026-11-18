/**
 * Polite HTTP client for Syoboi Calendar's non-HTML interfaces.
 * Rules implemented here come from https://docs.cal.syoboi.jp/rule/bot/ (checked 2026-11-18):
 * - one request at a time; wait ≥1s (we default to 3s) after the previous *response* before the next request
 * - identifying User-Agent `AppName/version (+URL)`; never rotate UA/IP to dodge limits
 * - honour 429 + Retry-After; back off exponentially with jitter on transient errors; cap retries, then stop
 * - reuse responses within their Cache-Control max-age instead of re-requesting
 */

export const SYOBOI_DB_ENDPOINT = "https://cal.syoboi.jp/db.php";
export const MIN_INTERVAL_FLOOR_MS = 1000;
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const USER_AGENT_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+ \(\+https?:\/\/[^\s)]+\)/;

export type FetchImpl = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

export interface FetchAttemptLog {
  requestKey: string;
  url: string;
  attempt: number;
  httpStatus: number | null;
  durationMs: number;
  bytes: number | null;
  fromCache: boolean;
  error: string | null;
  body: string | null;
}

export interface ResponseCache {
  get(url: string, now: Date): Promise<string | null>;
  set(url: string, body: string, maxAgeSeconds: number, now: Date): Promise<void>;
}

export interface SyoboiClientOptions {
  userAgent: string;
  minIntervalMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  baseBackoffMs?: number;
  fetchImpl?: FetchImpl;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  random?: () => number;
  cache?: ResponseCache;
  onAttempt?: (log: FetchAttemptLog) => void | Promise<void>;
}

export class SyoboiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "SyoboiHttpError";
  }
}

export function assertValidUserAgent(userAgent: string | undefined): asserts userAgent is string {
  if (!userAgent || !USER_AGENT_RE.test(userAgent)) {
    throw new Error(
      "SYOBOI_USER_AGENT must identify this app as `AppName/version (+https://info-page-with-contact)` " +
        "(see https://docs.cal.syoboi.jp/rule/bot/). Refusing to send requests."
    );
  }
}

export function buildDbUrl(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${SYOBOI_DB_ENDPOINT}?${search.toString()}`;
}

function parseMaxAge(header: string | null): number {
  if (!header) return 0;
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(header);
  return match ? Number(match[1]) : 0;
}

export function parseRetryAfter(header: string | null, now: Date): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now.getTime());
}

export class SyoboiClient {
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly baseBackoffMs: number;
  private readonly fetchImpl: FetchImpl;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly cache: ResponseCache | undefined;
  private readonly onAttempt: SyoboiClientOptions["onAttempt"];
  private queue: Promise<unknown> = Promise.resolve();
  private lastResponseAt: number | null = null;
  private networkRequestCount = 0;

  constructor(options: SyoboiClientOptions) {
    assertValidUserAgent(options.userAgent);
    const minInterval = options.minIntervalMs ?? 3000;
    if (!Number.isFinite(minInterval) || minInterval < MIN_INTERVAL_FLOOR_MS) {
      throw new Error(`minIntervalMs must be ≥ ${MIN_INTERVAL_FLOOR_MS} (got ${minInterval})`);
    }
    this.userAgent = options.userAgent;
    this.minIntervalMs = minInterval;
    this.maxRetries = options.maxRetries ?? 4;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.baseBackoffMs = options.baseBackoffMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.cache = options.cache;
    this.onAttempt = options.onAttempt;
  }

  get requestCount(): number {
    return this.networkRequestCount;
  }

  /** Fetch a db.php URL. Calls are serialised; concurrent callers wait their turn. */
  get(params: Record<string, string>, requestKey: string): Promise<string> {
    const url = buildDbUrl(params);
    const task = this.queue.then(() => this.fetchWithRetry(url, requestKey));
    // Keep the chain alive even if this task fails.
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async waitForSlot(): Promise<void> {
    if (this.lastResponseAt === null) return;
    const jitter = Math.floor(this.random() * this.minIntervalMs * 0.25);
    const readyAt = this.lastResponseAt + this.minIntervalMs + jitter;
    const delay = readyAt - this.now().getTime();
    if (delay > 0) await this.sleep(delay);
  }

  private backoffDelay(attempt: number): number {
    const exponential = this.baseBackoffMs * 2 ** (attempt - 1);
    return exponential + Math.floor(this.random() * exponential * 0.5);
  }

  private async fetchWithRetry(url: string, requestKey: string): Promise<string> {
    const cached = this.cache ? await this.cache.get(url, this.now()) : null;
    if (cached !== null) {
      await this.onAttempt?.({ requestKey, url, attempt: 0, httpStatus: null, durationMs: 0, bytes: cached.length, fromCache: true, error: null, body: cached });
      return cached;
    }

    for (let attempt = 1; ; attempt += 1) {
      await this.waitForSlot();
      const started = this.now().getTime();
      let status: number | null = null;
      let retryAfterMs: number | null = null;
      try {
        this.networkRequestCount += 1;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Response;
        try {
          response = await this.fetchImpl(url, {
            headers: { "User-Agent": this.userAgent, Accept: "text/xml, application/xml" },
            signal: controller.signal
          });
        } finally {
          clearTimeout(timer);
        }
        status = response.status;
        retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), this.now());
        const body = await response.text();
        this.lastResponseAt = this.now().getTime();
        if (body.length > MAX_BODY_BYTES) {
          throw new SyoboiHttpError(`Response too large (${body.length} bytes)`, status, false);
        }
        if (!response.ok) {
          const retryable = status === 429 || status >= 500;
          throw new SyoboiHttpError(`HTTP ${status}`, status, retryable);
        }
        await this.onAttempt?.({ requestKey, url, attempt, httpStatus: status, durationMs: this.lastResponseAt - started, bytes: body.length, fromCache: false, error: null, body });
        const maxAge = parseMaxAge(response.headers.get("cache-control"));
        if (this.cache && maxAge > 0) await this.cache.set(url, body, maxAge, this.now());
        return body;
      } catch (error) {
        this.lastResponseAt = this.now().getTime();
        const httpError =
          error instanceof SyoboiHttpError
            ? error
            : new SyoboiHttpError(error instanceof Error ? error.message : String(error), status, true);
        await this.onAttempt?.({ requestKey, url, attempt, httpStatus: status, durationMs: this.lastResponseAt - started, bytes: null, fromCache: false, error: httpError.message, body: null });
        if (!httpError.retryable || attempt > this.maxRetries) {
          throw httpError;
        }
        const delay = Math.max(retryAfterMs ?? 0, this.backoffDelay(attempt));
        await this.sleep(delay);
      }
    }
  }
}
