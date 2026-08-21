import { getAdminClient } from "@/lib/supabase/server";
import { exchangeCode } from "@/lib/strava";

export const runtime = "nodejs";

/**
 * Public endpoint — Strava redirects the user's browser here with a
 * `code` + the `state` we set at authorize time.
 *
 * Validates state → exchanges code for tokens → persists to
 * user_integrations → returns a tiny HTML page that deep-links back
 * into the SE7A app via the `se7a://` scheme so the OAuth WebBrowser
 * closes and the app receives the "connected" signal.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return htmlResponse(closingPage(false, `Strava: ${error}`));
  }
  if (!code || !state) {
    return htmlResponse(closingPage(false, "Missing code or state"));
  }

  const admin = getAdminClient();

  // Validate + consume the state row.
  const { data: stateRow } = await admin
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .eq("provider", "strava")
    .maybeSingle();
  if (!stateRow) {
    return htmlResponse(closingPage(false, "Invalid or expired state"));
  }
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await admin.from("oauth_states").delete().eq("state", state);
    return htmlResponse(closingPage(false, "State expired"));
  }
  await admin.from("oauth_states").delete().eq("state", state);

  // Exchange the code for tokens.
  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (e) {
    return htmlResponse(closingPage(false, (e as Error).message));
  }

  // Persist tokens against the SE7A user.
  const { error: upErr } = await admin.from("user_integrations").upsert(
    {
      user_id: stateRow.user_id,
      provider: "strava",
      provider_user_id: tokens.athlete ? String(tokens.athlete.id) : null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(tokens.expires_at * 1000).toISOString(),
      scope: "read,activity:read_all",
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

/**
 * Minimal HTML that redirects the browser back into the SE7A app via
 * a `se7a://` deep link. Also renders a fallback link + a status line
 * so users on browsers that block auto-redirects can tap through.
 */
function closingPage(ok: boolean, message?: string): string {
  const deepLink = ok
    ? "se7a://strava-connected"
    : `se7a://strava-connected?error=${encodeURIComponent(message ?? "unknown")}`;
  const title = ok ? "Strava connected." : "Strava connection failed.";
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
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #0b0d0b;
        color: #eef2e9;
        font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif;
        padding: 24px;
      }
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
