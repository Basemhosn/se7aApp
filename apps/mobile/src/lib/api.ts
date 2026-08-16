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
