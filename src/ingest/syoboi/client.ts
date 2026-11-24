/**
 * Polite HTTP client for Syoboi Calendar's non-HTML interfaces.
 * Rules implemented here come from https://docs.cal.syoboi.jp/rule/bot/ (checked 2026-11-18):
 * - one request at a time; wait ≥1s (we default to 3s) after the previous *response* before the next request
 * - identifying User-Agent `AppName/version (+URL)`; never rotate UA/IP to dodge limits
 * - honour 429 + Retry-After; back off exponentially with jitter on transient errors; cap retries, then stop
 * - reuse responses within their Cache-Control max-age instead of re-requesting
 * Resource limits (one time limit for headers and body, a byte cap counted while reading, no redirects, a cap on
 * waiting between retries) keep a misbehaving response from stalling or exhausting the ingest job.
 */

export const SYOBOI_DB_ENDPOINT = "https://cal.syoboi.jp/db.php";
export const MIN_INTERVAL_FLOOR_MS = 1000;
/** Largest response accepted, counted in bytes while reading. Real responses are under 0.3 MB (2026-11). */
export const MAX_BODY_BYTES = 30 * 1024 * 1024;
/** A Retry-After longer than this is not waited out: the request stops and a later scheduled run tries again. */
export const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;
const USER_AGENT_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+ \(\+https?:\/\/[^\s)]+\)/;

export type FetchImpl = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; redirect: "manual" }) => Promise<Response>;

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
  /** Time limit for one attempt, from sending the request to the end of the body. */
  timeoutMs?: number;
  baseBackoffMs?: number;
  /** Upper bound on the total time one request may spend waiting between attempts. */
  maxRetryWaitMs?: number;
  maxBodyBytes?: number;
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

/** Settles with `promise`, or rejects as soon as `signal` aborts, even when the promise itself ignores the signal. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/** Read the body as UTF-8, counting bytes as they arrive; past `limit` (or on abort) the transfer is cancelled. */
async function readBody(response: Response, limit: number, signal: AbortSignal): Promise<{ text: string; bytes: number }> {
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (declared > limit) {
    void response.body?.cancel().catch(() => undefined);
    throw new SyoboiHttpError(`Response too large (Content-Length ${declared} bytes, limit ${limit})`, response.status, false);
  }
  if (!response.body) return { text: "", bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await untilAborted(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new SyoboiHttpError(`Response too large (over ${limit} bytes)`, response.status, false);
      chunks.push(value);
    }
  } catch (error) {
    // Not awaited: a source that never answers the cancel must not hold the job.
    void reader.cancel(error).catch(() => undefined);
    throw error;
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(body), bytes };
}

export class SyoboiClient {
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxRetryWaitMs: number;
  private readonly maxBodyBytes: number;
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
    this.maxRetryWaitMs = options.maxRetryWaitMs ?? 15 * 60 * 1000;
    this.maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
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
      await this.onAttempt?.({ requestKey, url, attempt: 0, httpStatus: null, durationMs: 0, bytes: Buffer.byteLength(cached), fromCache: true, error: null, body: cached });
      return cached;
    }

    let waited = 0;
    for (let attempt = 1; ; attempt += 1) {
      await this.waitForSlot();
      const started = this.now().getTime();
      let status: number | null = null;
      let retryAfterMs: number | null = null;
      try {
        this.networkRequestCount += 1;
        // One time limit for the whole exchange (headers and body); the timer is always cleared.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${this.timeoutMs} ms`)), this.timeoutMs);
        let body: string;
        let bytes: number;
        let cacheMaxAge = 0;
        try {
          const response = await untilAborted(
            this.fetchImpl(url, {
              headers: { "User-Agent": this.userAgent, Accept: "text/xml, application/xml" },
              signal: controller.signal,
              // The endpoint does not redirect; a redirect would lead outside the address checked here.
              redirect: "manual"
            }),
            controller.signal
          );
          status = response.status;
          retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), this.now());
          cacheMaxAge = parseMaxAge(response.headers.get("cache-control"));
          if (status >= 300 && status < 400) {
            void response.body?.cancel().catch(() => undefined);
            throw new SyoboiHttpError(`Unexpected redirect (HTTP ${status})`, status, false);
          }
          ({ text: body, bytes } = await readBody(response, this.maxBodyBytes, controller.signal));
        } finally {
          clearTimeout(timer);
        }
        this.lastResponseAt = this.now().getTime();
        if (status < 200 || status >= 300) {
          const retryable = status === 429 || status >= 500;
          throw new SyoboiHttpError(`HTTP ${status}`, status, retryable);
        }
        await this.onAttempt?.({ requestKey, url, attempt, httpStatus: status, durationMs: this.lastResponseAt - started, bytes, fromCache: false, error: null, body });
        if (this.cache && cacheMaxAge > 0) await this.cache.set(url, body, cacheMaxAge, this.now());
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
        if (retryAfterMs !== null && retryAfterMs > MAX_RETRY_AFTER_MS) {
          throw new SyoboiHttpError(`${httpError.message}; Retry-After ${Math.round(retryAfterMs / 1000)} s exceeds ${MAX_RETRY_AFTER_MS / 1000} s, stopping`, status, false);
        }
        const delay = Math.max(retryAfterMs ?? 0, this.backoffDelay(attempt));
        if (waited + delay > this.maxRetryWaitMs) {
          throw new SyoboiHttpError(`${httpError.message}; retries would wait over ${this.maxRetryWaitMs / 1000} s in total, stopping`, status, false);
        }
        waited += delay;
        await this.sleep(delay);
      }
    }
  }
}
