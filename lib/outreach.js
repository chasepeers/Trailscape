// Provider outreach email: asks a venue for consent to list it on Trailscape (10 Nov 2026).
//
// This is the ONE outreach template (the old "full version" was retired on 10 Nov). It is sent from the back office
// (Outreach → venue → "Send outreach email") through Resend, so the link to the site arrives as a direct link,
// unlike emails written through Google's Gmail API, which wrap every link in a google.com redirect.
// The same wording is kept in the claude.ai project file claude/outreach-templates.md.

export const OUTREACH_TEMPLATE = "short";
export const SITE_URL = "https://trailscape.co.za/";
export const outreachFrom = env => env.OUTREACH_FROM || "Chase · Trailscape <hello@trailscape.co.za>";
export const outreachReplyTo = env => env.OUTREACH_REPLY_TO || env.NOTIFY_TO || "hello@trailscape.co.za";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// A first name or "the Smith family" is fine; anything odd falls back to "there".
export function greetingName(contactName) {
  const n = String(contactName || "").trim();
  return n && n.length <= 60 && !/[@<>]/.test(n) ? n : "there";
}

// { subject, text, html } for one venue.
export function outreachEmail({ venueName, contactName }) {
  const name = String(venueName || "").trim();
  if (!name) throw new Error("Venue name missing");
  const hi = greetingName(contactName);
  const subject = `Listing ${name} on Trailscape (no fee)`;
  const text = [
    `Hi ${hi},`,
    "",
    `I'm Chase from Trailscape (${SITE_URL}), a booking agency for nature and outdoor stays in the Western Cape. I'd love to list ${name} on our map.`,
    "",
    "When a client wants to stay with you, I'll contact you directly and book with you on their behalf, at your rates and on your terms. There's no fee or commission for you.",
    "",
    "May I have your consent to:",
    `1. Use photos of ${name} that are already online in your listing, credited to you, and`,
    "2. Make booking enquiries and reservations with you for our clients?",
    "",
    `A quick "yes" is all I need. You can ask me to update or remove your listing at any time.`,
    "",
    "Thanks so much,",
    "Chase",
    "Trailscape · hello@trailscape.co.za",
  ].join("\n");
  // Plain, personal-looking HTML (no buttons or images): it reads like a normal email and lands in the inbox more often.
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">
<p>Hi ${esc(hi)},</p>
<p>I'm Chase from Trailscape (<a href="${SITE_URL}">${SITE_URL}</a>), a booking agency for nature and outdoor stays in the Western Cape. I'd love to list ${esc(name)} on our map.</p>
<p>When a client wants to stay with you, I'll contact you directly and book with you on their behalf, at your rates and on your terms. There's no fee or commission for you.</p>
<p>May I have your consent to:<br>1. Use photos of ${esc(name)} that are already online in your listing, credited to you, and<br>2. Make booking enquiries and reservations with you for our clients?</p>
<p>A quick "yes" is all I need. You can ask me to update or remove your listing at any time.</p>
<p>Thanks so much,<br>Chase<br>Trailscape · <a href="mailto:hello@trailscape.co.za">hello@trailscape.co.za</a></p>
</div>`;
  return { subject, text, html };
}
