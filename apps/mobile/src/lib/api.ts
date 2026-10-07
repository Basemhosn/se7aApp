import * as Sentry from "@sentry/react-native";
import i18n from "./i18n";
import { supabase } from "./supabase";

const BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://se7a.app";

async function bearerHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function localeHeader(): Record<string, string> {
  const lang = i18n.language || "en";
  return { "Accept-Language": lang };
}

/**
 * Client's local timezone offset in minutes east of UTC (matches
 * `-new Date().getTimezoneOffset()`; UAE = +240). Backend endpoints
 * that compute "today's totals" read this to define the day window in
 * the user's local time instead of UTC — required so meals logged
 * between local midnight and local 04:00 stay on today's ring.
 */
function tzHeader(): Record<string, string> {
  return {
    "X-Tz-Offset-Min": String(-new Date().getTimezoneOffset()),
  };
}

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export class ProRequiredError extends ApiError {
  feature: string;
  constructor(details: {
    message: string;
    feature: string;
    raw?: unknown;
  }) {
    super(402, details.message, details.raw);
    this.feature = details.feature;
  }
}

export class RateLimitedError extends ApiError {
  retryAfterSec: number;
  kind: "burst" | "daily" | "unknown";
  constructor(details: {
    message: string;
    retry_after_sec?: number;
    limit?: number;
    kind?: "burst" | "daily";
    raw?: unknown;
  }) {
    super(429, details.message, details.raw);
    this.retryAfterSec = details.retry_after_sec ?? 60;
    this.kind = details.kind ?? "unknown";
  }
}

/** Human-friendly rate-limit copy the caller can drop into an Alert. */
export function rateLimitMessage(err: RateLimitedError): {
  title: string;
  body: string;
} {
  if (err.kind === "daily") {
    return {
      title: "Daily scan limit reached",
      body: "You've hit today's scan limit. Resets at midnight — or add manually via the Log tab.",
    };
  }
  const min = Math.ceil(err.retryAfterSec / 60);
  return {
    title: "Slow down a moment",
    body:
      min <= 1
        ? "Too many scans in a row — try again in about a minute."
        : `Too many scans in a row — try again in about ${min} minutes.`,
  };
}

async function parseOrThrow<T>(res: Response, route: string): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) || `HTTP ${res.status}`;
    // Fire-and-forget Sentry capture for server-side failures. 402
    // (Pro required) and 429 (rate limited) are expected UX paths —
    // skip. 5xx and unexpected 4xx are things we want to know about.
    if (res.status >= 500 || (res.status >= 400 && res.status !== 402 && res.status !== 429 && res.status !== 401)) {
      Sentry.captureMessage(`api ${res.status} on ${route}`, {
        level: res.status >= 500 ? "error" : "warning",
        tags: { route, http_status: String(res.status), error_code: err },
        extra: {
          body:
            typeof body === "object" && body !== null
              ? Object.keys(body).slice(0, 10)
              : null,
        },
      });
    }
    if (res.status === 402 && body && typeof body === "object") {
      const b = body as { details?: string; feature?: string };
      throw new ProRequiredError({
        message: b.details ?? err,
        feature: b.feature ?? "unknown",
        raw: body,
      });
    }
    if (res.status === 429 && body && typeof body === "object") {
      const b = body as {
        details?: string;
        retry_after_sec?: number;
        limit?: number;
      };
      const isDaily = /day|daily|24/i.test(b.details ?? "");
      throw new RateLimitedError({
        message: b.details ?? err,
        retry_after_sec: b.retry_after_sec,
        limit: b.limit,
        kind: isDaily ? "daily" : "burst",
        raw: body,
      });
    }
    throw new ApiError(res.status, err, body);
  }
  return body as T;
}

/** Typed JSON request — adds Bearer + Content-Type. */
export async function api<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...localeHeader(),
    ...tzHeader(),
    ...(await bearerHeader()),
    ...(init.headers ?? {}),
  };
  // iOS URLSession ignores `cache: 'no-store'` — RN fetch on iOS
  // hands the request straight to NSURLSession, which respects its
  // own cache policy. To guarantee a fresh fetch for GETs (idempotent
  // ledger reads etc.), append a monotonic cache-buster to the URL.
  // POSTs are never cached by NSURLSession so we skip the buster
  // there to keep server logs clean.
  const method = (init.method ?? "GET").toUpperCase();
  const bustedPath =
    method === "GET"
      ? `${path}${path.includes("?") ? "&" : "?"}_t=${Date.now()}`
      : path;
  const res = await fetch(`${BASE}${bustedPath}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  return parseOrThrow<T>(res, path.split("?")[0] ?? path);
}

/**
 * Multipart upload (image scans). Pass a local file URI and a field
 * name; React Native handles the multipart serialization natively
 * when we pass { uri, type, name } as the value.
 */
export async function apiUpload<T>(
  path: string,
  field: string,
  file: { uri: string; mimeType: string; fileName?: string },
  extra: Record<string, string> = {}
): Promise<T> {
  const form = new FormData();
  // React Native FormData accepts this shape natively.
  form.append(field, {
    uri: file.uri,
    type: file.mimeType,
    name: file.fileName ?? `upload.${extOf(file.mimeType)}`,
  } as unknown as Blob);
  for (const [k, v] of Object.entries(extra)) {
    form.append(k, v);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: form,
    headers: {
      ...localeHeader(),
      ...tzHeader(),
      ...(await bearerHeader()),
    },
    cache: "no-store",
  });
  return parseOrThrow<T>(res, path.split("?")[0] ?? path);
}

function extOf(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

/**
 * Stream a POST that returns plain-text chunks (used by the coach
 * endpoint, which calls streamText + toTextStreamResponse server-side).
 *
 * Uses XMLHttpRequest.onprogress because RN's fetch() in Hermes does
 * not expose a usable ReadableStream on all platforms. onprogress gives
 * the accumulated responseText so far on every network flush, which is
 * exactly what we want for token-by-token rendering.
 *
 * onChunk is called with the FULL accumulated text each time; the
 * caller just overwrites its "streaming" state with that value. Resolves
 * with the final text once the connection closes successfully.
 */
export async function streamTextPost(
  path: string,
  body: unknown,
  onChunk: (fullText: string) => void
): Promise<string> {
  const auth = await bearerHeader();
  const headers = {
    "Content-Type": "application/json",
    ...localeHeader(),
    ...tzHeader(),
    ...auth,
  };

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.onprogress = () => {
      // responseText accumulates — RN gives us a growing buffer, which
      // is exactly what the UI wants (overwrite the streaming turn each
      // flush rather than tracking deltas ourselves).
      onChunk(xhr.responseText);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText);
      } else {
        // The server returns JSON on failure (`{ error: ... }`). Try to
        // parse an error message; fall back to the status.
        try {
          const parsed = JSON.parse(xhr.responseText) as {
            error?: string;
            details?: string;
          };
          reject(
            new ApiError(
              xhr.status,
              parsed.details ?? parsed.error ?? `HTTP ${xhr.status}`,
              parsed
            )
          );
        } catch {
          reject(new ApiError(xhr.status, `HTTP ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "network_error"));
    xhr.ontimeout = () => reject(new ApiError(0, "timeout"));
    xhr.send(JSON.stringify(body));
  });
}
