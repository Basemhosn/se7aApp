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

async function parseOrThrow<T>(res: Response): Promise<T> {
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
    ...(await bearerHeader()),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  return parseOrThrow<T>(res);
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
      ...(await bearerHeader()),
    },
  });
  return parseOrThrow<T>(res);
}

function extOf(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}
