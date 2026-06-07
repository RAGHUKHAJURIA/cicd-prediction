import { Resend } from "resend";

// Lazy-initialize the Resend client only when actually called,
// so the server can start even if the API key is missing (dev/test).
let resend: Resend | null = null;

function getClient(): Resend | null {
  if (resend) return resend;
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY is not set — emails will be skipped.");
    return null;
  }
  resend = new Resend(apiKey);
  return resend;
}

/**
 * Send a styled welcome / registration-confirmation email.
 * This function NEVER throws — if sending fails it logs the error
 * and returns silently so the registration flow is not interrupted.
 */
export async function sendWelcomeEmail(params: {
  to: string;
  username: string;
  provider?: "local" | "github";
}): Promise<void> {
  const client = getClient();
  if (!client) return; // RESEND_API_KEY not configured — silently skip

  const from = process.env["EMAIL_FROM"] || "onboarding@resend.dev";
  const dashboardUrl = process.env["DASHBOARD_URL"] || "http://localhost:3001";
  const providerLabel =
    params.provider === "github" ? "GitHub" : "email & password";

  try {
    console.log(`[mailer] Attempting to send welcome email to ${params.to} from ${from}`);

    const { data, error } = await client.emails.send({
      from,
      to: [params.to],
      subject: "Welcome to CI/CD Reliability Intelligence 🚀",
      html: buildWelcomeHtml({
        username: params.username,
        providerLabel,
        dashboardUrl,
      }),
    });

    if (error) {
      console.error("[mailer] Resend API returned error:", JSON.stringify(error, null, 2));
      return;
    }

    console.log(`[mailer] ✅ Welcome email sent to ${params.to} — id: ${data?.id}`);
  } catch (err: any) {
    // Log but never throw — email failure must not break registration
    console.error("[mailer] Failed to send welcome email:", err?.message ?? err);
    if (err?.statusCode) console.error("[mailer] Status code:", err.statusCode);
  }
}

// ---------------------------------------------------------------------------
// Styled HTML template
// ---------------------------------------------------------------------------
function buildWelcomeHtml(opts: {
  username: string;
  providerLabel: string;
  dashboardUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
               style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);
                      border:1px solid rgba(99,102,241,0.25);
                      border-radius:16px;overflow:hidden;">
          <!-- Header gradient bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#6366f1,#8b5cf6,#a855f7);"></td>
          </tr>
          <!-- Logo / Title -->
          <tr>
            <td style="padding:32px 40px 16px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#e2e8f0;">
                🚀 CI/CD Reliability Intelligence
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#cbd5e1;line-height:1.6;">
                Hey <strong style="color:#f8fafc;">${opts.username}</strong>, welcome aboard!
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#94a3b8;line-height:1.6;">
                Your account has been created via <strong style="color:#a5b4fc;">${opts.providerLabel}</strong>.
                You're all set to start monitoring your CI/CD pipelines, tracking build reliability,
                and uncovering failure patterns.
              </p>
              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);">
                    <a href="${opts.dashboardUrl}/repos"
                       target="_blank"
                       style="display:inline-block;padding:14px 32px;
                              font-size:15px;font-weight:600;color:#ffffff;
                              text-decoration:none;letter-spacing:0.3px;">
                      Open Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
                If you didn't create this account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(148,163,184,0.15);">
              <p style="margin:0;font-size:12px;color:#475569;text-align:center;">
                © ${new Date().getFullYear()} CI/CD Reliability Intelligence Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
