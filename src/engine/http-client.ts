/**
 * @file http-client.ts
 * @description Thin HTTP helpers with timeout, typed errors, and no third-party
 * HTTP libraries. Uses native fetch (Node 18+).
 *
 * Both helpers throw typed errors so callers can handle timeout vs HTTP vs
 * network errors distinctly without swallowing exceptions.
 */

// =============================================================================
// TYPED ERRORS
// =============================================================================

/** Thrown when a request is aborted because it exceeded timeoutMs. */
export class HttpTimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
  }
}

/** Thrown when a server responds with a non-2xx status code. */
export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly statusCode: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${statusCode} from ${url}`);
    this.name = 'HttpError';
  }
}

// =============================================================================
// fetchWithTimeout
// =============================================================================

/**
 * GET (or any method) fetch with an AbortController-based timeout.
 *
 * @throws {HttpTimeoutError} When the request exceeds timeoutMs.
 * @throws {HttpError}        When the server returns a non-2xx status.
 * @throws {Error}            On network-level failures (DNS, ECONNREFUSED, etc.)
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.includes('aborted'))
    ) {
      throw new HttpTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new HttpError(url, response.status);
  }

  return response;
}

// =============================================================================
// postWithTimeout
// =============================================================================

/**
 * POST with JSON body and an AbortController-based timeout.
 *
 * @throws {HttpTimeoutError} When the request exceeds timeoutMs.
 * @throws {HttpError}        When the server returns a non-2xx status.
 * @throws {Error}            On network-level failures.
 */
export async function postWithTimeout(
  url: string,
  body: unknown,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<Response> {
  const { timeoutMs = 8000, headers = {} } = options;

  return fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
    timeoutMs,
  });
}
