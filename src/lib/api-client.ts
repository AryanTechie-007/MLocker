/**
 * MLocker Shared API Client
 *
 * Provides resilient, typed client-side data fetching that distinguishes between:
 * 1. True network failures (TypeError: Failed to fetch, offline, connection refused).
 * 2. Unexpected non-JSON server responses (502/504 gateway timeouts, HTML crash pages).
 * 3. Structured API error responses (400, 403, 404, 409, 500 JSON).
 * 4. 401 Unauthorized sessions (automatic redirect to /login).
 */

export class ApiError extends Error {
  status?: number;
  statusText?: string;
  code?: string;
  details?: unknown;
  isNetworkError: boolean;
  isNonJsonError: boolean;

  constructor(
    message: string,
    options?: {
      status?: number;
      statusText?: string;
      code?: string;
      details?: unknown;
      isNetworkError?: boolean;
      isNonJsonError?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "ApiError";
    this.status = options?.status;
    this.statusText = options?.statusText;
    this.code = options?.code;
    this.details = options?.details;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isNonJsonError = options?.isNonJsonError ?? false;

    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Extracts a user-friendly error string from any thrown error.
 */
export function getErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred"
): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  return fallback;
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuthRedirect?: boolean;
}

/**
 * Resilient wrapper around fetch for client-side API requests.
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { body, headers, skipAuthRedirect, ...rest } = options;

  const resolvedHeaders = new Headers(headers);

  let resolvedBody: BodyInit | undefined | null = undefined;

  if (body !== undefined && body !== null) {
    if (
      typeof body === "string" ||
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof URLSearchParams ||
      body instanceof ArrayBuffer
    ) {
      resolvedBody = body as BodyInit;
    } else {
      resolvedBody = JSON.stringify(body);
      if (!resolvedHeaders.has("Content-Type")) {
        resolvedHeaders.set("Content-Type", "application/json");
      }
    }
  }

  if (!resolvedHeaders.has("Accept")) {
    resolvedHeaders.set("Accept", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: resolvedHeaders,
      body: resolvedBody,
    });
  } catch (err: unknown) {
    // Preserve intentional abort signals
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    console.error(`[apiFetch] Network failure for ${url}:`, err);
    throw new ApiError(
      "Network connection failed. Please check your internet connection.",
      {
        isNetworkError: true,
        cause: err,
      }
    );
  }

  // Handle 401 Unauthorized -> redirect to login
  if (res.status === 401) {
    console.warn(`[apiFetch] 401 Unauthorized for ${url}`);
    if (
      !skipAuthRedirect &&
      typeof window !== "undefined" &&
      window.location &&
      !window.location.pathname.startsWith("/login")
    ) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    throw new ApiError("Session expired or unauthorized. Please log in again.", {
      status: 401,
      statusText: res.statusText,
      code: "UNAUTHORIZED",
    });
  }

  // Read response body as text to safely handle non-JSON error pages
  const text = await res.text();
  let parsedJson: unknown = null;

  if (text && text.trim().length > 0) {
    try {
      parsedJson = JSON.parse(text);
    } catch {
      console.error(
        `[apiFetch] Server returned non-JSON (${res.status}) for ${url}:`,
        text.length > 300 ? text.slice(0, 300) + "..." : text
      );
      const message = res.status
        ? `Server returned an unexpected response (${res.status})`
        : "Server returned an unexpected non-JSON response";
      throw new ApiError(message, {
        status: res.status,
        statusText: res.statusText,
        isNonJsonError: true,
        details: text,
      });
    }
  }

  if (!res.ok) {
    const errorRecord =
      parsedJson && typeof parsedJson === "object"
        ? (parsedJson as Record<string, unknown>)
        : undefined;

    const errorMessage =
      (typeof errorRecord?.error === "string" && errorRecord.error) ||
      `Request failed with status ${res.status}${
        res.statusText ? ` (${res.statusText})` : ""
      }`;
    console.error(
      `[apiFetch] API error (${res.status}) for ${url}:`,
      parsedJson || text
    );
    throw new ApiError(errorMessage, {
      status: res.status,
      statusText: res.statusText,
      code: typeof errorRecord?.code === "string" ? errorRecord.code : undefined,
      details: errorRecord?.details ?? parsedJson,
    });
  }

  return (parsedJson ?? {}) as T;
}
