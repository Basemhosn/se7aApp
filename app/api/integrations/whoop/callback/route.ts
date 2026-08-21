import { getAdminClient } from "@/lib/supabase/server";
import { exchangeCode, fetchProfile } from "@/lib/whoop";

export const runtime = "nodejs";

/**
 * Public endpoint. Whoop redirects the browser here with `code` +
 * the `state` we set at authorize time. Validates state, exchanges
 * code for tokens, persists, deep-links back to the app.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return htmlResponse(closingPage(false, `Whoop: ${error}`));
  }
  if (!code || !state) {
    return htmlResponse(closingPage(false, "Missing code or state"));
  }

  const admin = getAdminClient();

  const { data: stateRow } = await admin
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .eq("provider", "whoop")
    .maybeSingle();
  if (!stateRow) {
    return htmlResponse(closingPage(false, "Invalid or expired state"));
  }
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await admin.from("oauth_states").delete().eq("state", state);
    return htmlResponse(closingPage(false, "State expired"));
  }
  await admin.from("oauth_states").delete().eq("state", state);

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (e) {
    return htmlResponse(closingPage(false, (e as Error).message));
  }

  // Best-effort profile fetch — nice to have a stable provider_user_id
  // for future analytics but not required for the sync itself.
  const profile = await fetchProfile(tokens.access_token).catch(() => null);

  const { error: upErr } = await admin.from("user_integrations").upsert(
    {
      user_id: stateRow.user_id,
      provider: "whoop",
      provider_user_id: profile ? String(profile.user_id) : null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(
        Date.now() + tokens.expires_in * 1000
      ).toISOString(),
      scope: tokens.scope,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (upErr) {
    return htmlResponse(closingPage(false, upErr.message));
  }

  return htmlResponse(closingPage(true));
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function closingPage(ok: boolean, message?: string): string {
  const deepLink = ok
    ? "se7a://whoop-connected"
    : `se7a://whoop-connected?error=${encodeURIComponent(message ?? "unknown")}`;
  const title = ok ? "Whoop connected." : "Whoop connection failed.";
  const detail = ok
    ? "You can return to SE7A now."
    : message ?? "Something went wrong.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0b0d0b; color: #eef2e9; font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif; padding: 24px; }
      h1 { color: #f6b73c; font-size: 22px; margin: 0 0 8px; text-align: center; }
      p  { color: #8a937f; font-size: 14px; margin: 0 0 20px; text-align: center; }
      a  { display: inline-block; padding: 12px 20px; background: #f6b73c; color: #0b0d0b; border-radius: 12px; text-decoration: none; font-weight: 600; }
    </style>
    <script>
      setTimeout(function () { window.location.replace(${JSON.stringify(deepLink)}); }, 300);
    </script>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${detail}</p>
    <a href="${deepLink}">Return to SE7A</a>
  </body>
</html>`;
}
