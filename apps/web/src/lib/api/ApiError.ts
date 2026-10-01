import type { HttpErrorBody } from '@greynote/contracts';

/**
 * A failed API response, as an Error.
 *
 * `message` is the SERVER'S wording, rendered verbatim and never rewritten. `code` is control
 * flow only — which state to show, whether to offer a retry — and never a source of copy.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  /** What the CALLER needs to act on — field-level validation errors, a `code` refinement. */
  readonly data: unknown;

  constructor(body: HttpErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.code = body.code;
    this.requestId = body.request.requestId;
    this.data = body.data;
  }

  /** A 401 the session layer can attempt to recover from by refreshing. */
  get isAuthExpiry(): boolean {
    return this.status === 401;
  }

  /** Retrying a 4xx produces the same failure more slowly. */
  get isRetryable(): boolean {
    return this.status >= 500;
  }

  /**
   * The API refines a generic code with `data.code` (e.g. a 409 `CONFLICT` whose `data.code` is
   * `FINANCIAL_YEAR_READ_ONLY`). This is the more specific of the two.
   */
  get detailCode(): string {
    const data = this.data;
    if (typeof data === 'object' && data !== null) {
      const refined = (data as Record<string, unknown>)['code'];
      if (typeof refined === 'string') return refined;
    }
    return this.code;
  }

}

/** Not an API response at all: the network is down, the API is not running. No request id. */
export class NetworkError extends Error {
  constructor() {
    super('Could not reach the server. Check your connection and try again.');
    this.name = 'NetworkError';
  }
}
