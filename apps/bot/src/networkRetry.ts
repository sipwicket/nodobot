const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const CAUSE_DETAILS: Record<string, string> = {
  ETIMEDOUT: "TCP connection to api.telegram.org timed out",
  ECONNRESET: "connection reset by api.telegram.org",
  ECONNREFUSED: "connection refused by api.telegram.org",
  EPIPE: "connection to api.telegram.org broke",
  EAI_AGAIN: "DNS lookup for api.telegram.org failed",
  ENOTFOUND: "DNS could not resolve api.telegram.org",
  UND_ERR_CONNECT_TIMEOUT: "connect timeout to api.telegram.org",
  UND_ERR_SOCKET: "socket error talking to api.telegram.org",
  AbortError: "request aborted after timeout",
  TimeoutError: "request timed out",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function collectErrorChain(err: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    const rec = asRecord(current);
    if (!rec) break;
    chain.push(rec);
    current = rec.error ?? rec.cause;
  }
  return chain;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return true;
  }
  const rec = asRecord(err);
  const name = rec?.name;
  return name === "AbortError" || name === "TimeoutError";
}

export type NetworkCause = {
  code?: string;
  name?: string;
  message: string;
};

export function extractNetworkCause(err: unknown): NetworkCause {
  const chain = collectErrorChain(err);
  let code: string | undefined;
  let name: string | undefined;
  let message = err instanceof Error ? err.message : String(err ?? "unknown error");

  for (const rec of chain) {
    const recCode = rec.code ?? rec.errno;
    if (!code && typeof recCode === "string") code = recCode;
    if (!name && typeof rec.name === "string" && rec.name !== "Error" && rec.name !== "HttpError") {
      name = rec.name;
    }
    if (typeof rec.message === "string" && rec.message && rec.message !== message) {
      // Prefer the nested fetch/system message when grammY wraps it.
      if (message.startsWith("Network request for ")) message = rec.message;
    }
  }

  if (err instanceof Error && !name) name = err.name;
  return { code, name, message };
}

export function describeNetworkCause(err: unknown): { code: string; detail: string } {
  const cause = extractNetworkCause(err);
  const code = cause.code ?? cause.name ?? "unknown";
  const detail = CAUSE_DETAILS[code] ?? cause.message;
  return { code, detail };
}

export class TelegramNetworkError extends Error {
  readonly operation: string;
  readonly attempts: number;
  readonly timeoutMs: number;
  readonly causeCode: string;

  constructor(opts: {
    operation: string;
    attempts: number;
    timeoutMs: number;
    cause: unknown;
  }) {
    const { code, detail } = describeNetworkCause(opts.cause);
    super(
      `Telegram ${opts.operation} failed after ${opts.attempts} attempt(s) (${opts.timeoutMs}ms each): ${code} (${detail})`,
      { cause: opts.cause },
    );
    this.name = "TelegramNetworkError";
    this.operation = opts.operation;
    this.attempts = opts.attempts;
    this.timeoutMs = opts.timeoutMs;
    this.causeCode = code;
  }
}

export function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof TelegramNetworkError) return true;
  if (isAbortError(err)) return true;

  for (const rec of collectErrorChain(err)) {
    const code = rec.code ?? rec.errno;
    if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
    if (isAbortError(rec)) return true;
  }

  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  return (
    (lower.includes("network request") && lower.includes("failed")) ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("timed out")
  );
}

function abortAfter(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  if (typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(timeoutMs), cancel: () => {} };
  }
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(handle),
  };
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; delaysMs?: number[] },
): Promise<T> {
  const attempts = opts?.attempts ?? 2;
  const delaysMs = opts?.delaysMs ?? [750];
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const canRetry = isTransientNetworkError(err) && i < attempts - 1;
      if (!canRetry) throw err;
      const delay = delaysMs[i] ?? delaysMs[delaysMs.length - 1] ?? 750;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/** Retry a call with a hard per-attempt timeout, then wrap failures in TelegramNetworkError. */
export async function retryWithTimeout<T>(
  operation: string,
  fn: (signal: AbortSignal) => Promise<T>,
  opts?: { attempts?: number; timeoutMs?: number; delaysMs?: number[] },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const delaysMs = opts?.delaysMs ?? [400, 1600];
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    const { signal, cancel } = abortAfter(timeoutMs);
    try {
      return await fn(signal);
    } catch (err) {
      lastError = err;
      const canRetry = isTransientNetworkError(err) && i < attempts - 1;
      if (!canRetry) {
        if (isTransientNetworkError(err)) {
          throw new TelegramNetworkError({ operation, attempts: i + 1, timeoutMs, cause: err });
        }
        throw err;
      }
      const delay = delaysMs[i] ?? delaysMs[delaysMs.length - 1] ?? 400;
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      cancel();
    }
  }

  throw new TelegramNetworkError({ operation, attempts, timeoutMs, cause: lastError });
}

export class CooldownGate {
  #failures = 0;
  #openUntil = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  isOpen(): boolean {
    return Date.now() < this.#openUntil;
  }

  remainingMs(): number {
    return Math.max(0, this.#openUntil - Date.now());
  }

  recordSuccess(): void {
    this.#failures = 0;
    this.#openUntil = 0;
  }

  /** Returns true if this failure opened the cooldown. */
  recordFailure(): boolean {
    if (this.isOpen()) return false;
    this.#failures++;
    if (this.#failures < this.failureThreshold) return false;
    this.#failures = 0;
    this.#openUntil = Date.now() + this.cooldownMs;
    return true;
  }
}
