// The stay's one-click answer page, linked from the availability request email.
//   GET  /api/operator/HS-1100?t=<token>   shows the trip and Yes / No buttons (never changes anything: mail scanners open links)
//   POST /api/operator/HS-1100             form: t, answer=available|unavailable, price?, note?
import { longDate, rand, HttpError } from "../../../lib/api.js";
import { loadEnquiry, tokenOk, recordAnswer, OPEN_FOR_ANSWER } from "../../../lib/operator.js";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function page(title, inner, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Trailscape</title><style>
:root{--ink:#1d2a22;--muted:#5b6b60;--line:#dfe6e0;--bg:#f5f7f4;--card:#fff;--go:#1f6f43;--no:#9b3b2e}
@media (prefers-color-scheme:dark){:root{--ink:#e8eee9;--muted:#9fb0a4;--line:#2c3a31;--bg:#121a15;--card:#18221c;--go:#3fa36b;--no:#d0705f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:520px;margin:0 auto;padding:28px 16px 48px}.brand{font-weight:700;letter-spacing:.02em;color:var(--go);margin-bottom:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
h1{font-size:1.35rem;margin:0 0 4px}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:14px 0 0}dt{color:var(--muted)}dd{margin:0;font-weight:600}
.muted{color:var(--muted)}label{display:block;font-weight:600;margin:14px 0 6px}input,textarea{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)}
.btns{display:grid;gap:10px;margin-top:16px}button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:13px 16px;cursor:pointer;color:#fff}
.yes{background:var(--go)}.no{background:var(--no)}small{display:block;color:var(--muted);margin-top:6px}.ok{font-size:2rem}
</style></head><body><main><div class="brand">Trailscape</div>${inner}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
const problem = (msg, status = 400) => page("Problem", `<div class="card"><h1>Sorry</h1><p>${esc(msg)}</p>
  <p class="muted">You can also just reply to our email, or write to hello@trailscape.co.za.</p></div>`, status);

async function find(db, ref, token) {
  const e = await loadEnquiry(db, String(ref || "").toUpperCase()).catch(() => null);
  return e && tokenOk(e, token) ? e : null;
}

function tripHtml(e) {
  return `<dl><dt>Arriving</dt><dd>${esc(longDate(e.check_in))}</dd><dt>Leaving</dt><dd>${esc(longDate(e.check_out))}</dd>
    <dt>Nights</dt><dd>${e.nights}</dd><dt>Group</dt><dd>${e.hikers} guest${e.hikers === 1 ? "" : "s"}</dd><dt>Lead guest</dt><dd>${esc(e.guest_name)}</dd>
    ${e.flexible ? `<dt>Dates</dt><dd>Flexible</dd>` : ""}</dl>${e.notes ? `<p class="muted">“${esc(e.notes)}”</p>` : ""}`;
}

export async function onRequestGet({ env, params, request }) {
  const token = new URL(request.url).searchParams.get("t") || "";
  const e = await find(env.DB, params.ref, token);
  if (!e) return problem("This link isn't valid. Please use the link in our most recent email.", 404);
  const closed = !OPEN_FOR_ANSWER.includes(e.status);
  const prev = e.op_answer ? `<p class="muted">You answered <b>${e.op_answer === "available" ? "yes" : "no"}</b>${e.op_price ? ` (${rand(e.op_price)})` : ""}. You can change it below.</p>` : "";
  return page(`Availability ${e.ref}`, `<div class="card"><span class="muted">${esc(e.ref)}</span><h1>${esc(e.stay_name)}</h1>${tripHtml(e)}</div>
  ${closed ? `<div class="card"><p>This request is closed (${esc(e.status.replace("_", " "))}). Thank you!</p></div>` : `
  <form class="card" method="post" action="/api/operator/${encodeURIComponent(e.ref)}">
    <h1 style="font-size:1.1rem">Do you have space?</h1>${prev}
    <input type="hidden" name="t" value="${esc(token)}">
    <label for="price">Total price for the group (rand)</label>
    <input id="price" name="price" inputmode="numeric" placeholder="e.g. 4800" value="${e.op_price ?? ""}">
    <small>The full amount for all ${e.hikers} guest${e.hikers === 1 ? "" : "s"} for ${e.nights} night${e.nights === 1 ? "" : "s"}. Leave empty if you'd rather reply by email.</small>
    <label for="note">Anything else? (optional)</label>
    <textarea id="note" name="note" rows="3" placeholder="e.g. Only the 4-bed cottage is free, or we have space the weekend after">${esc(e.op_note || "")}</textarea>
    <div class="btns"><button class="yes" name="answer" value="available">Yes, we have space</button>
    <button class="no" name="answer" value="unavailable">No, we're full on those dates</button></div>
  </form>`}`);
}

export async function onRequestPost({ env, params, request }) {
  const f = await request.formData().catch(() => null);
  if (!f) return problem("Something went wrong reading your answer. Please try again.");
  const token = String(f.get("t") || "");
  const e = await find(env.DB, params.ref, token);
  if (!e) return problem("This link isn't valid. Please use the link in our most recent email.", 404);
  try {
    const answer = String(f.get("answer") || "");
    await recordAnswer(env, env.DB, e.ref, { answer, price: f.get("price"), note: f.get("note") }, "operator");
    const p = answer === "available" && String(f.get("price") || "").trim() ? Math.round(+String(f.get("price")).replace(/[^\d.]/g, "")) : null;
    return page("Thank you", `<div class="card"><div class="ok">✓</div><h1>Thank you!</h1>
      <p>${answer === "available" ? `We've noted that you have space${p ? ` at ${rand(p)} for the group` : ""}. We'll confirm with the guest and email you to book.` : "We've noted that you're full and will let the guest know."}</p>
      <p class="muted"><a href="${new URL(request.url).pathname}?t=${esc(token)}">Change my answer</a></p></div>`);
  } catch (err) {
    if (err instanceof HttpError) return problem(err.message, err.status);
    console.error("operator answer", err);
    return problem("Something went wrong on our side. Please reply to our email instead.", 500);
  }
}
