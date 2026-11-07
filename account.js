// ---------- Accounts: sign in / sign up with an emailed code, admin sign-in with a password ----------
// Loaded by app.js after app-core.js. Exposes window.TSAccount, which booking.js uses for My trips and to prefill forms.
// Sign-in lives only on the My trips page. The Back office link appears only for the admin account.
(() => {
  "use strict";
  const API = ((window.HS_CONFIG || {}).apiBase || "/api").replace(/\/$/, "");
  const listeners = new Set();
  const A = window.TSAccount = {
    user: null,
    ready: null,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    renderSignIn,
    signOut,
  };

  async function call(path, body) {
    const r = await fetch(API + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" } : { credentials: "same-origin" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || "Something went wrong. Please try again."); e.status = r.status; throw e; }
    return data;
  }
  function setUser(u) {
    A.user = u || null;
    syncNav();
    listeners.forEach(fn => { try { fn(A.user); } catch (e) { console.warn(e); } });
  }
  A.ready = call("/auth/me").then(d => setUser(d.user)).catch(() => setUser(null));

  // ---------- navigation: Back office only for the admin ----------
  function syncNav() {
    const links = document.getElementById("links"); if (!links) return;
    let a = links.querySelector('a[data-r="admin"]');
    if (A.user && A.user.admin) {
      if (!a) { a = document.createElement("a"); a.href = "/admin.html"; a.dataset.r = "admin"; a.textContent = "Back office"; links.appendChild(a); }
    } else if (a) a.remove();
    const foot = document.querySelector("footer [data-admin-link]");
    if (foot) foot.hidden = !(A.user && A.user.admin);
  }
  // The old in-app back office route now goes to the real back office (admin) or My trips (everyone else).
  window.ops = function () {
    A.ready.then(() => { if (A.user && A.user.admin) location.href = "/admin.html"; else location.replace("#trips"); });
    view.innerHTML = `<div class="wrap phead"><p class="muted">One moment…</p></div>`;
  };

  async function signOut() {
    try { await call("/auth/logout", {}); } catch (e) {}
    setUser(null);
    toast("Signed out");
  }

  // ---------- the sign-in / sign-up panel ----------
  const st = document.createElement("style");
  st.textContent = `
  footer [data-admin-link][hidden] { display: none; }
  .acct { max-width: 460px; display: grid; gap: 16px; }
  .acct-tabs { display: flex; gap: 6px; background: var(--band); border-radius: 999px; padding: 4px; width: max-content; max-width: 100%; }
  .acct-tabs button { border: 0; background: transparent; border-radius: 999px; padding: 7px 16px; font: inherit; cursor: pointer; color: var(--muted); }
  .acct-tabs button[aria-selected="true"] { background: var(--card, #fff); color: var(--fg); box-shadow: 0 1px 2px rgba(13,19,33,.08); }
  .acct form { display: grid; gap: 12px; }
  .acct .field input { width: 100%; }
  .acct-code { font: 600 1.6rem/1 "Fragment Mono", ui-monospace, monospace; letter-spacing: .35em; text-align: center; padding: 12px 8px !important; }
  .acct-msg { font-size: .88rem; min-height: 1.2em; margin: 0; }
  .acct-msg.err { color: #b42318; }
  .acct-links { display: flex; gap: 14px; flex-wrap: wrap; font-size: .88rem; }
  .acct-links button { border: 0; background: none; padding: 0; font: inherit; color: var(--fg); text-decoration: underline; cursor: pointer; }
  .acct-who { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  `;
  document.head.appendChild(st);

  const escA = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Draws the panel into el. onDone(user) runs after a successful sign-in.
  function renderSignIn(el, onDone) {
    const s = { mode: "signin", step: "email", email: "", name: "", phone: "" };
    const draw = (msg = "", err = false) => {
      const m = `<p class="acct-msg ${err ? "err" : ""}" role="status" aria-live="polite">${escA(msg)}</p>`;
      let body;
      if (s.step === "email" && s.mode === "signin") body = `
        <form id="acf"><label class="field">Email<input id="ac-email" type="email" required autocomplete="email" placeholder="you@example.com" value="${escA(s.email)}"></label>
          <button class="btn primary" type="submit">Email me a sign-in code</button>${m}</form>
        <div class="acct-links"><span class="muted">New to Trailscape?</span><button type="button" data-mode="signup">Create an account</button></div>`;
      else if (s.step === "email") body = `
        <form id="acf">
          <label class="field">Full name<input id="ac-name" required autocomplete="name" placeholder="Lead hiker" value="${escA(s.name)}"></label>
          <label class="field">Email<input id="ac-email" type="email" required autocomplete="email" placeholder="you@example.com" value="${escA(s.email)}"></label>
          <label class="field">Mobile<input id="ac-phone" type="tel" required autocomplete="tel" placeholder="082 000 0000" value="${escA(s.phone)}"></label>
          <label class="field hscheck"><input type="checkbox" required> I agree that Trailscape keeps these details to manage my bookings and enquiries.</label>
          <button class="btn primary" type="submit">Email me a code</button>${m}</form>
        <div class="acct-links"><span class="muted">Already have an account?</span><button type="button" data-mode="signin">Sign in</button></div>`;
      else if (s.step === "code") body = `
        <p style="margin:0">We emailed a 6-digit code to <b>${escA(s.email)}</b>. It works for 10 minutes.</p>
        <form id="acf"><label class="field">Code<input id="ac-code" class="acct-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required placeholder="000000"></label>
          <button class="btn primary" type="submit">${s.mode === "signup" ? "Create account" : "Sign in"}</button>${m}</form>
        <div class="acct-links"><button type="button" id="ac-resend">Send a new code</button><button type="button" id="ac-back">Use a different email</button></div>
        <p class="muted" style="font-size:.82rem;margin:0">Can't see it? Check your spam folder.</p>`;
      else body = `
        <form id="acf"><p style="margin:0">Signing in as <b>${escA(s.email)}</b>.</p>
          <label class="field">Password<input id="ac-pw" type="password" required autocomplete="current-password"></label>
          <button class="btn primary" type="submit">Sign in</button>${m}</form>
        <div class="acct-links"><button type="button" id="ac-back">Use a different email</button></div>`;
      el.innerHTML = `<div class="acct card panel">
        ${s.step === "email" ? `<div class="acct-tabs" role="tablist"><button type="button" role="tab" data-mode="signin" aria-selected="${s.mode === "signin"}">Sign in</button><button type="button" role="tab" data-mode="signup" aria-selected="${s.mode === "signup"}">Create account</button></div>` : ""}
        <div><h2 style="font-size:1.4rem;margin:0">${s.step === "code" ? "Check your email" : s.step === "password" ? "Enter your password" : s.mode === "signup" ? "Create your account" : "Sign in"}</h2>
        ${s.step === "email" ? `<p class="muted" style="margin:6px 0 0;font-size:.92rem">No password needed. We email you a one-time code.</p>` : ""}</div>
        ${body}</div>`;
      el.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { s.mode = b.dataset.mode; keep(); draw(); });
      const back = el.querySelector("#ac-back"); if (back) back.onclick = () => { s.step = "email"; draw(); };
      const resend = el.querySelector("#ac-resend"); if (resend) resend.onclick = () => start(true);
      const f = el.querySelector("#acf");
      f.onsubmit = e => { e.preventDefault(); keep(); s.step === "email" ? start() : s.step === "code" ? verify() : password(); };
      const first = el.querySelector("#ac-code, #ac-pw, #ac-email"); if (first && s.step !== "email") first.focus();
    };
    const keep = () => {
      const v = id => { const i = el.querySelector(id); return i ? i.value.trim() : null; };
      if (v("#ac-email") !== null) s.email = v("#ac-email");
      if (v("#ac-name") !== null) s.name = v("#ac-name");
      if (v("#ac-phone") !== null) s.phone = v("#ac-phone");
    };
    const busy = (on, label) => { const b = el.querySelector("#acf button[type=submit]"); if (b) { b.disabled = on; if (label) b.textContent = label; } };

    async function start(again) {
      busy(true, "Sending…");
      try {
        const d = await call("/auth/start", { email: s.email, mode: s.mode, name: s.name, phone: s.phone });
        if (d.password) { s.step = "password"; draw(); return; }
        if (s.mode === "signup" && d.existing) s.mode = "signin";
        s.step = "code"; draw(again === true ? "We sent a new code." : "");
      } catch (e) {
        if (e.status === 404 && s.mode === "signin") { s.mode = "signup"; draw("There's no account with that email yet. Add your name and mobile to create one.", true); return; }
        draw(e.message, true);
      }
    }
    async function verify() {
      busy(true, "Checking…");
      try { const d = await call("/auth/verify", { email: s.email, code: el.querySelector("#ac-code").value }); done(d.user); }
      catch (e) { draw(e.message, true); }
    }
    async function password() {
      busy(true, "Signing in…");
      try { const d = await call("/auth/password", { email: s.email, password: el.querySelector("#ac-pw").value }); done(d.user); }
      catch (e) { draw(e.message, true); }
    }
    function done(user) { setUser(user); toast(`Signed in as ${user.name.split(" ")[0]}`); if (onDone) onDone(user); }
    draw();
  }
})();
