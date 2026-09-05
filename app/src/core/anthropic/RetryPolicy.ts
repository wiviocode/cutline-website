/**
 * Which failures are worth retrying, and how long to wait.
 *
 * Written from the API's documented error semantics rather than observed behaviour. Deliberately
 * conservative — retry only what is plainly transient, fail fast on anything that will still be
 * wrong on the second attempt.
 */

export type RetryDecision = { retry: true; after: number } | { retry: false; reason: string };
export type TransportFailure = "timeout" | "network" | "cancelled" | "other";

export class RetryPolicy {
  constructor(
    public readonly maxAttempts = 4,
    public readonly baseDelay = 1.0,
    public readonly maxDelay = 30.0,
    /** Adds up to ±25% so a batch that hits a rate limit together does not retry in lockstep. */
    public readonly jitter = true,
  ) {}

  /**
   * Classify an HTTP status. `429` honours `retry-after`; `529` and `5xx` are transient; `408`
   * is a timeout; everything else in `4xx` cannot be helped by an identical request, and on
   * `401` retrying risks locking an account.
   */
  decide(status: number, attempt: number, retryAfter?: number | null): RetryDecision {
    if (attempt >= this.maxAttempts) return { retry: false, reason: `HTTP ${status} after ${attempt} attempts` };
    switch (true) {
      case status === 429:
      case status === 408 || status === 529:
        return { retry: true, after: retryAfter ?? this.delay(attempt) };
      case status >= 500 && status <= 599:
        return { retry: true, after: this.delay(attempt) };
      case status === 401: return { retry: false, reason: "HTTP 401 — the API key was rejected" };
      case status === 400: return { retry: false, reason: "HTTP 400 — malformed request" };
      case status === 404: return { retry: false, reason: "HTTP 404 — unknown model or endpoint" };
      case status === 413: return { retry: false, reason: "HTTP 413 — image too large; lower the detail setting" };
      default: return { retry: false, reason: `HTTP ${status}` };
    }
  }

  /** Transport-level failures are transient by nature; a cancellation is not. */
  decideTransport(kind: TransportFailure, attempt: number): RetryDecision {
    if (attempt >= this.maxAttempts) return { retry: false, reason: `${kind} after ${attempt} attempts` };
    if (kind === "cancelled") return { retry: false, reason: "cancelled" };
    if (kind === "other") return { retry: false, reason: "network error" };
    return { retry: true, after: this.delay(attempt) };
  }

  /** Exponential backoff: 1s, 2s, 4s, 8s … capped, optionally jittered. */
  delay(attempt: number): number {
    const raw = Math.min(this.maxDelay, this.baseDelay * Math.pow(2, Math.max(0, attempt - 1)));
    return this.jitter ? raw * (0.75 + Math.random() * 0.5) : raw;
  }
}
