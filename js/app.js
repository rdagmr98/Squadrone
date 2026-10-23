/* Squadrone Mantenimento · H7 — presenze da cellulare. */
(function () {
  "use strict";

  const TIPI = {
    licenza: { l: "Licenza", i: "suitcase-rolling", c: "#22d3ee" },
    guardia: { l: "Guardia", i: "shield-star", c: "#fbbf24" },
    polveriera: { l: "Polveriera", i: "warehouse", c: "#fb7185" },
    stormo72: { l: "72° Stormo", i: "airplane-in-flight", c: "#60a5fa" },
    orario: { l: "Assenza oraria", i: "clock-countdown", c: "#fb923c" },
    altro: { l: "Altro", i: "note-pencil", c: "#a78bfa" }
  };
  const PRESENTE = { l: "Presente", i: "check-circle", c: "#34d399" };
  const GRUPPI = { officina: "Officina", tecnica: "Sezione Tecnica" };
  const ST = { attesa: "In attesa", no: "Rifiutato", si: "Accettato" };
  // Funzioni assegnate solo dal comandante (campo fn sulla persona)
  const FN = { cte: "Cte di Gruppo", aiutante: "Aiutante Maggiore" };
  // Tipi di licenza (campo sub); riposo medico e convalescenza non si inseriscono oltre il giorno prima
  const LIC = { ordinaria: "Licenza ordinaria", straordinaria: "Licenza straordinaria", festivita: "Recupero festività", l937: "Riposo L. 937/77",
    compensativo: "Recupero compensativo", l104: "Permesso L. 104/92", riposo: "Riposo medico", convalescenza: "Licenza di convalescenza", altra: "Altro" };
  const MEDICA = ["riposo", "convalescenza"];
  const KEY = "sq_uid";
  const S = { me: null, view: "me", day: null, grp: "", lic: "todo", reopen: null, back: null, last: 0 };

  const $ = (s, r = document) => r.querySelector(s);
  const app = $("#app"), nav = $("#nav"), dlg = $("#sheet"), toastEl = $("#toast");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = (n) => `<i class="ph-light ph-${n}"></i>`;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const parse = (s) => { const [y, m, d] = s.split("-"); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const fmt = (s, o = { day: "numeric", month: "short" }) => parse(s).toLocaleDateString("it-IT", o);
  const range = (a) => (a.dal === a.al ? fmt(a.dal) : `${fmt(a.dal)} – ${fmt(a.al)}`) + (a.dalle ? ` · ${a.dalle}–${a.alle}` : "");
  const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const title = (s) => norm(s).replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const fullName = (p) => `${p.cognome} ${p.nome}`;
  const initials = (p) => ((p.nome[0] || "") + (p.cognome[0] || "")).toUpperCase();
  const byId = (id) => Store.tables.personnel.find((p) => p.id === id);
  const byName = (l) => l.sort((a, b) => fullName(a).localeCompare(fullName(b), "it"));
  // effettivi: Cte di Gruppo e Aiutante Maggiore sono figure di controllo, fuori da conteggi, elenchi e assegnazioni
  const people = () => byName(Store.tables.personnel.filter((p) => !FN[p.fn]));
  const controllo = () => byName(Store.tables.personnel.filter((p) => FN[p.fn]));
  const tipo = (a) => TIPI[a.tipo] || TIPI.altro;
  const tl = (a) => LIC[a.sub] || tipo(a).l;
  // i rifiutati (dal comandante o, per le licenze, dal Cte di Gruppo) non contano come assenza, ma restano visibili in "Prossimi" a chi li ha chiesti
  const actsOn = (pid, d) => Store.tables.absences.filter((a) => a.personId === pid && a.cmd !== "no" && a.cte !== "no" && a.dal <= d && d <= a.al);
  const upcoming = (pid) => Store.tables.absences.filter((a) => a.personId === pid && a.al >= today()).sort((a, b) => a.dal.localeCompare(b.dal));
  const hm = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; };
  // assenza oraria: assente solo dentro la sua fascia di oggi; fuori fascia (o in altri giorni) resta presente
  const assente = (a, d) => a.tipo !== "orario" || (d === today() && a.dalle <= hm() && hm() < a.alle);
  const statusOf = (pid, d) => { const a = actsOn(pid, d).find((x) => assente(x, d)); return a ? tipo(a) : PRESENTE; };

  // Ruoli: comandante = Store.cfg.cmd (unico, niente PIN) · admin = nessun gruppo · capo = admin con capo "officina"|"tecnica"
  const isCmd = (p) => !!p && p.id === Store.cfg.cmd;
  const isAdmin = (p) => !!p && (!!p.admin || isCmd(p));
  const isCte = (p) => !!p && p.fn === "cte";
  const isAiut = (p) => !!p && p.fn === "aiutante";
  const isStaff = (p) => isAdmin(p) || !!(p && FN[p.fn]); // vede Oggi e Personale come il comandante
  const grp = (p) => (isAdmin(p) || FN[p.fn] || !GRUPPI[p.gruppo] ? null : p.gruppo);
  const capoDi = (p) => (p && p.admin && GRUPPI[p.capo] ? p.capo : null);
  const ruolo = (p) => isCmd(p) ? "Comandante" : [capoDi(p) ? "Capo " + GRUPPI[p.capo] : p.admin ? "Admin" : "", FN[p.fn]].filter(Boolean).join(" · ") || GRUPPI[grp(p)] || "";
  const home = (p) => (isAiut(p) ? "licenze" : isStaff(p) ? "oggi" : "me");
  // Impegno: cmd = decisione finale del comandante · capo = parere del capo gruppo (solo se inserito da un utente con gruppo)
  // Licenza: dopo il comandante (cmd "si") decide il Cte di Gruppo (cte) · poi l'Aiutante Maggiore la registra (fatta)
  const stato = (a) => (a.tipo === "licenza" && a.cmd === "si" ? a.cte || "attesa" : a.cmd || "attesa");
  const stText = (a) => (stato(a) === "attesa" && a.cmd === "si" ? "In attesa Cte di Gruppo" : ST[stato(a)]);
  const stTag = (s, txt = ST[s]) => ` <span class="st ${s}">${txt}</span>`;
  const badge = (a) => (stato(a) === "si" ? "" : stTag(stato(a), stText(a)));
  const canApprove = (p) => isCmd(p) || !!capoDi(p) || isCte(p);
  // coda del Cte di Gruppo: solo licenze già accettate dal comandante
  const daCte = (a) => a.tipo === "licenza" && a.cmd === "si" && !a.cte;
  const pend = (a) => !!byId(a.personId) && ((!a.cmd && (isCmd(S.me) || (a.gruppo && !a.capo && a.gruppo === capoDi(S.me)))) || (isCte(S.me) && daCte(a)));
  const daApprovare = () => Store.tables.absences.filter(pend);
  const qKey = (a) => (a.cmd === "si" ? "cte" : isCmd(S.me) ? "cmd" : "capo");
  const decide = (a, v) => { const k = qKey(a); a[k] = v; a[k + "At"] = new Date().toISOString(); };
  const canDel = (a) => isAdmin(S.me) || a.personId === S.me.id;
  const dt = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const licOk = (a) => a.tipo === "licenza" && a.cte === "si" && byId(a.personId);
  const licDaFare = () => Store.tables.absences.filter((a) => licOk(a) && !a.fatta);
  const giorni = (a) => Math.round((parse(a.al) - parse(a.dal)) / 864e5) + 1;
  const gruppoSeg = (v, attr = "") => `<div class="seg">${Object.entries(GRUPPI).map(([k, l]) =>
    `<label><input type="radio" name="gruppo" value="${k}" ${v === k ? "checked" : ""} ${attr}>${l}</label>`).join("")}</div>`;

  // Web Push ad app chiusa: la sottoscrizione sta in personnel[].push, la invia l'Action di squadrone-data (push/notify.mjs)
  const pushOk = () => "PushManager" in window && "serviceWorker" in navigator && !!Store.cfg.vapid;
  const iosTab = () => /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone;
  const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  async function ensureSub(ask) {
    if (!pushOk() || !S.me) return;
    if (ask && (await Notification.requestPermission()) !== "granted") throw new Error("Notifiche non consentite: abilitale nelle impostazioni");
    if (Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(Store.cfg.vapid) }));
    const j = sub.toJSON(), me = S.me;
    if ((me.push || []).some((x) => x.endpoint === j.endpoint)) return;
    // un dispositivo appartiene a una sola persona (telefono condiviso: passa all'ultimo che accede)
    await Store.mutate("personnel", (l) => {
      l.forEach((p) => { if (p.push) p.push = p.push.filter((x) => x.endpoint !== j.endpoint); });
      const p = l.find((x) => x.id === me.id);
      if (p) p.push = [...(p.push || []), { endpoint: j.endpoint, keys: j.keys }].slice(-5);
    }, `notifiche ${me.cognome}`);
  }
  const pushBar = () => (pushOk() && Notification.permission === "default"
    ? `<button class="ghost wide push-on rise" data-act="push">${icon("bell-ringing")}<span>Attiva le notifiche</span></button>` : "");
  const pushHint = () => iosTab() ? "Per ricevere le notifiche: Condividi → Aggiungi alla schermata Home, poi apri l'app da lì."
    : pushOk() && Notification.permission === "denied" ? "Notifiche bloccate: riattivale dalle impostazioni del telefono." : "";

  async function hash(pw, salt) {
    const te = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", te.encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: te.encode(salt), iterations: 100000 }, key, 256);
    return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- ui primitives ---------- */

  function toast(msg, bad) {
    (dlg.open && !dlg.classList.contains("closing") ? dlg : document.body).appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.className = "toast" + (bad ? " bad" : "");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  async function run(btn, fn) {
    if (btn) { btn.classList.add("loading"); btn.disabled = true; }
    try { await fn(); } catch (e) { toast(e.message || "Errore", true); }
    finally { if (btn) { btn.classList.remove("loading"); btn.disabled = false; } }
  }

  function sheet(html) {
    $(".sheet-body", dlg).innerHTML = html;
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }

  function closeSheet() {
    S.reopen = S.back = null;
    if (!dlg.open) return;
    dlg.classList.add("closing");
    setTimeout(() => { dlg.classList.remove("closing"); dlg.close(); }, 200);
  }

  /* ---------- views ---------- */

  const loader = `<div class="boot"><div class="crest pulse">${icon("wrench")}</div></div>`;

  const authView = () => `
    <section class="auth">
      <div class="crest rise">${icon("wrench")}</div>
      <span class="eyebrow pill rise" style="--d:1">Hangar 7</span>
      <h1 class="brand rise" style="--d:2">Squadrone<br><span>Mantenimento</span></h1>
      <div class="shell rise" style="--d:3">
        <form class="core form" id="authForm" data-mode="login" novalidate>
          <div class="seg">
            <button type="button" class="on" data-act="mode" data-m="login">Accedi</button>
            <button type="button" data-act="mode" data-m="reg">Registrati</button>
          </div>
          <input name="nome" placeholder="Nome" autocomplete="given-name" autocapitalize="words" enterkeyhint="next">
          <input name="cognome" placeholder="Cognome" autocomplete="family-name" autocapitalize="words" enterkeyhint="next">
          <div class="pw">
            <input name="pw" type="password" placeholder="Password" autocomplete="current-password" enterkeyhint="go">
            <button type="button" data-act="eye" aria-label="Mostra password">${icon("eye")}</button>
          </div>
          <div class="reg-only">${gruppoSeg("")}</div>
          <button class="cta wide" type="submit"><span>Entra</span><b>${icon("arrow-right")}</b></button>
        </form>
      </div>
    </section>`;

  function header() {
    const n = canApprove(S.me) ? daApprovare().length : 0;
    return `
    <header class="top rise">
      <button class="who" data-act="profile">
        <span class="av" style="--c:${statusOf(S.me.id, today()).c}">${initials(S.me)}</span>
        <span><b>${esc(S.me.nome)} ${esc(S.me.cognome)}</b><small>${esc(ruolo(S.me) || "Sq. Mantenimento · H7")}</small></span>
      </button>
      <span class="top-r">
        ${canApprove(S.me) ? `<button class="icon-btn bell${S.view === "richieste" ? " on" : ""}" data-act="view" data-v="richieste" aria-label="Da approvare">${icon("bell")}${n ? `<b>${n}</b>` : ""}</button>` : ""}
        <button class="icon-btn" data-act="refresh" aria-label="Aggiorna">${icon("arrows-clockwise")}</button>
      </span>
    </header>`;
  }

  const navView = (v, views) =>
    [["oggi", "squares-four", "Oggi"], ["personale", "users-three", "Personale"], ["me", "user", "Io"]]
      .filter(([k]) => views[k])
      .map(([k, i, l]) => `<button data-act="view" data-v="${k}" class="${v === k ? "on" : ""}">${icon(i)}<span>${l}</span></button>`)
      .join("") + (v !== "me" && isAdmin(S.me) ? `<button class="plus" data-act="add" aria-label="Assegna">${icon("plus")}</button>` : "");

  function statusCard(acts, d) {
    const a = acts[0], t = a ? tipo(a) : PRESENTE;
    const sub = a ? [a.luogo && esc(a.luogo), a.dal !== a.al ? `fino al ${fmt(a.al, { day: "numeric", month: "long" })}` : "", a.dalle ? `dalle ${a.dalle} alle ${a.alle}` : "",
      stato(a) === "si" ? "" : a.cmd ? stText(a) : "In attesa di approvazione", a.note ? esc(a.note) : ""].filter(Boolean) : [];
    return `
      <div class="shell rise" style="--d:1"><div class="core status" style="--c:${t.c}">
        <div class="eyebrow">Oggi · ${fmt(d, { weekday: "long", day: "numeric", month: "long" })}</div>
        <div class="st-main"><span class="st-ic">${icon(t.i)}</span><span class="st-l">${a ? tl(a) : t.l}</span></div>
        ${sub.length ? `<div class="st-sub">${sub.join("<br>")}</div>` : ""}
      </div></div>`;
  }

  const actRow = (a, i) => {
    const t = tipo(a);
    return `<div class="row rise" style="--d:${Math.min(i, 8) + 4};--c:${t.c}">
      <span class="tag">${icon(t.i)}</span>
      <span class="row-t"><b>${tl(a)}</b><small>${range(a)}${badge(a)}</small>${a.luogo ? `<em>${esc(a.luogo)}</em>` : ""}${a.note ? `<em>${esc(a.note)}</em>` : ""}</span>
      ${canDel(a) ? `<button class="icon-btn sm" data-act="del" data-id="${a.id}" aria-label="Elimina">${icon("x")}</button>` : ""}
    </div>`;
  };

  function meView() {
    const d = today(), mine = upcoming(S.me.id);
    return statusCard(actsOn(S.me.id, d), d) +
      `<button class="cta wide rise" style="--d:2" data-act="add" data-who="${S.me.id}"><span>Nuovo impegno</span><b>${icon("plus")}</b></button>` +
      (mine.length ? `<h2 class="sec rise" style="--d:3">Prossimi</h2><div class="list">${mine.map(actRow).join("")}</div>` : "");
  }

  function oggiView() {
    const d = S.day, all = people().filter((p) => !S.grp || grp(p) === S.grp), ass = [], ore = [], pres = [], counts = {};
    all.forEach((p) => {
      const a = actsOn(p.id, d), full = a.filter((x) => assente(x, d)), h = a.filter((x) => !assente(x, d));
      full.length ? ass.push([p, full]) : pres.push(p); // assenza oraria fuori fascia = presente, elencata a parte
      if (h.length) ore.push([p, h]);
    });
    [...ass, ...ore].forEach(([, a]) => (counts[a[0].tipo] = (counts[a[0].tipo] || 0) + 1));
    const pct = all.length ? Math.round((pres.length / all.length) * 100) : 0;
    const isToday = d === today();

    const rows = (l, d0) => l.map(([p, acts], i) => {
      const t = tipo(acts[0]), notes = [...acts.map((x) => x.luogo), ...acts.map((x) => x.note)].filter(Boolean).join(" · ");
      const when = acts.map((x) => (x.dalle ? `${x.dalle}–${x.alle}` : x.dal !== x.al ? range(x) : "")).filter(Boolean).join(", ");
      const w = acts.find((x) => stato(x) === "attesa");
      return `<div class="row tap rise" style="--d:${Math.min(i, 8) + d0};--c:${t.c}" data-act="person" data-id="${p.id}">
        <span class="tag">${icon(t.i)}</span>
        <span class="row-t"><b>${esc(fullName(p))}</b><small>${[...new Set(acts.map(tl))].join(" + ")}${when ? " · " + when : ""}${w ? stTag("attesa", stText(w)) : ""}</small>${notes ? `<em>${esc(notes)}</em>` : ""}</span>
      </div>`;
    }).join("");

    return `
      <div class="daybar rise">
        <button class="icon-btn" data-act="day" data-n="-1" aria-label="Giorno prima">${icon("caret-left")}</button>
        <label class="day-l">
          <small class="${isToday ? "now" : ""}">${isToday ? "Oggi" : fmt(d, { year: "numeric" })}</small>
          <span>${fmt(d, { weekday: "long", day: "numeric", month: "long" })}</span>
          <input type="date" value="${d}" data-change="day" data-act="pick" aria-label="Scegli giorno">
        </label>
        <button class="icon-btn" data-act="day" data-n="1" aria-label="Giorno dopo">${icon("caret-right")}</button>
      </div>
      <div class="seg grp rise">${[["", "Tutti"], ["officina", "Officina"], ["tecnica", "Sez. Tecnica"]].map(([k, l]) =>
        `<button data-act="filtro" data-g="${k}" class="${S.grp === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="bento">
        <div class="shell rise" style="--d:1"><div class="core kpi">
          <div class="eyebrow"><i class="dot" style="--c:var(--ok)"></i>Presenti</div>
          <div class="num ok">${pres.length}<small>/${all.length}</small></div>
          <div class="bar"><i style="--p:${pct}%"></i></div>
        </div></div>
        <div class="shell rise" style="--d:2"><div class="core kpi">
          <div class="eyebrow"><i class="dot" style="--c:var(--warn)"></i>Assenti</div>
          <div class="num warn">${ass.length}</div>
        </div></div>
      </div>
      <div class="chips rise" style="--d:3">
        ${isToday ? "" : `<button class="chip back" data-act="today">${icon("calendar-dots")}Oggi</button>`}
        ${Object.keys(TIPI).filter((k) => counts[k]).map((k) => `<span class="chip" style="--c:${TIPI[k].c}">${icon(TIPI[k].i)}${TIPI[k].l}<b>${counts[k]}</b></span>`).join("")}
      </div>
      ${ass.length ? `<h2 class="sec rise" style="--d:4">Assenti</h2><div class="list">${rows(ass, 5)}</div>` : ""}
      ${ore.length ? `<h2 class="sec rise" style="--d:5">Assenze orarie<b>${ore.length}</b></h2><div class="list">${rows(ore, 6)}</div>` : ""}
      ${pres.length ? `<details class="pres rise" style="--d:6"><summary>Presenti<b>${pres.length}</b></summary>
        <div class="names">${pres.map((p) => `<button data-act="person" data-id="${p.id}">${esc(fullName(p))}</button>`).join("")}</div></details>` : ""}`;
  }

  function personaleView() {
    const d = today(), all = people(), ctl = controllo();
    const pRow = (p, i) => {
      const s = statusOf(p.id, d);
      return `<div class="row tap rise" style="--d:${Math.min(i, 8) + 2};--c:${s.c}" data-act="person" data-id="${p.id}" data-name="${esc(norm(fullName(p) + " " + p.nome + " " + p.cognome))}">
          <span class="av">${initials(p)}</span>
          <span class="row-t"><b>${esc(fullName(p))}${isAdmin(p) ? " " + icon("crown") : ""}</b><small>${[s.l, ruolo(p)].filter(Boolean).join(" · ")}</small></span>
          ${icon("caret-right")}
        </div>`;
    };
    return `
      <div class="search rise">${icon("magnifying-glass")}<input type="search" placeholder="Cerca" data-input="q" autocomplete="off"></div>
      <h2 class="sec rise" style="--d:1">Personale<b>${all.length}</b></h2>
      <div class="list">${all.map(pRow).join("")}</div>
      ${ctl.length ? `<h2 class="sec rise" style="--d:2">Funzioni di controllo<b>${ctl.length}</b></h2><div class="list">${ctl.map(pRow).join("")}</div>` : ""}`;
  }

  function reqRow(a, i) {
    const p = byId(a.personId), t = tipo(a), by = a.by !== a.personId && byId(a.by);
    const info = [ruolo(p), by && "inserito da " + fullName(by)].filter(Boolean).join(" · ");
    const capo = isCmd(S.me) && a.gruppo ? stTag(a.capo || "attesa", `Capo ${GRUPPI[a.gruppo]}: ${ST[a.capo || "attesa"].toLowerCase()}`) : "";
    return `<div class="req rise" style="--d:${Math.min(i, 8) + 1};--c:${t.c}">
      <div class="row">
        <span class="tag">${icon(t.i)}</span>
        <span class="row-t"><b>${esc(fullName(p))}</b><small>${tl(a)} · ${range(a)}</small>${a.luogo ? `<em>${esc(a.luogo)}</em>` : ""}${a.note ? `<em>${esc(a.note)}</em>` : ""}${info || capo ? `<em>${esc(info)}${capo}</em>` : ""}</span>
      </div>
      <div class="req-act">
        <button class="ghost" data-act="ok" data-id="${a.id}" data-v="no">${icon("x")}<span>Rifiuta</span></button>
        <button class="ghost yes" data-act="ok" data-id="${a.id}" data-v="si">${icon("check")}<span>Accetta</span></button>
      </div>
    </div>`;
  }

  function richiesteView() {
    const l = daApprovare().sort((a, b) => a.dal.localeCompare(b.dal));
    return `<h2 class="sec rise">Da approvare<b>${l.length}</b></h2>` +
      (l.length ? `<button class="cta wide rise" data-act="okAll"><span>Approva tutto (${l.length})</span><b>${icon("check")}</b></button>
        <div class="list">${l.map(reqRow).join("")}</div>` : `<p class="empty rise" style="--d:1">Nessuna richiesta in attesa</p>`);
  }

  // Aiutante Maggiore (desktop 16:9): licenze approvate dal Cte, da registrare; "fatta" = già lavorata
  const dn = (s) => fmt(s, { day: "2-digit", month: "2-digit", year: "numeric" });
  const licList = () => {
    const all = Store.tables.absences.filter(licOk).sort((a, b) => a.dal.localeCompare(b.dal) || a.at.localeCompare(b.at)), f = S.lic;
    return { all, l: all.filter((a) => (f === "todo" ? !a.fatta : f === "done" ? a.fatta : true)) };
  };

  function licenzeView() {
    const { all, l } = licList(), todo = all.filter((a) => !a.fatta).length, f = S.lic;
    const row = (a, i) => {
      const p = byId(a.personId), by = a.by !== a.personId && byId(a.by);
      const iter = [by && `Inserita da ${fullName(by)} ${dt(a.at)}`, a.cmdAt && `Comandante ${dt(a.cmdAt)}`, a.cteAt && `Cte di Gruppo ${dt(a.cteAt)}`, a.fatta && `Registrata ${dt(a.fattaAt)}`];
      // ponytail: celle vuote senza "—": su mobile spariscono (:empty), su desktop il trattino lo mette il CSS
      return `<div class="lic-r rise${a.fatta ? " done" : ""}" style="--d:${Math.min(i, 8) + 2}">
        <button class="chk" data-act="fatta" data-id="${a.id}" aria-label="${a.fatta ? "Da fare" : "Registrata"}" aria-pressed="${!!a.fatta}">${icon(a.fatta ? "check-square" : "square")}</button>
        <span data-l="Nominativo"><b>${esc(fullName(p))}</b><small>${esc(ruolo(p))}</small></span>
        <span data-l="Tipo">${esc(LIC[a.sub] || "")}</span>
        <span data-l="Luogo">${esc(a.luogo || "")}</span>
        <span data-l="Dal">${dn(a.dal)}</span>
        <span data-l="Al">${dn(a.al)}</span>
        <span data-l="Giorni">${giorni(a)}</span>
        <span data-l="Note">${esc(a.note || "")}</span>
        <span data-l="Iter">${iter.filter(Boolean).map((x) => `<small>${esc(x)}</small>`).join("")}</span>
      </div>`;
    };
    return `<h2 class="sec rise">Licenze<b>${todo}</b></h2>
      <div class="seg grp lic-f rise">${[["todo", `Da fare ${todo}`], ["done", `Fatte ${all.length - todo}`], ["all", `Tutte ${all.length}`]].map(([k, t]) =>
        `<button data-act="lic" data-f="${k}" class="${f === k ? "on" : ""}">${t}</button>`).join("")}</div>
      ${l.length ? `<button class="ghost na-btn rise" data-act="stampa">${icon("printer")}<span>Stampa nullaosta (${l.length})</span></button>` : ""}
      ${l.length ? `<div class="lic-h"><span></span><span>Nominativo</span><span>Tipo</span><span>Luogo</span><span>Dal</span><span>Al</span><span>Giorni</span><span>Note</span><span>Iter</span></div>
        <div class="list">${l.map(row).join("")}</div>` : `<p class="empty rise" style="--d:1">${f === "done" ? "Nessuna licenza registrata" : "Nessuna licenza da registrare"}</p>`}`;
  }

  // nullaosta cartaceo (2 copie per A4, si taglia a metà): precompilato, ogni campo e intestazione modificabile prima di stampare
  const ED = 'contenteditable spellcheck="false"';
  function nullaosta(a) {
    const p = byId(a.personId) || {}, tec = p.gruppo === "tecnica";
    const tipo = (LIC[a.sub] || "").replace(/^Licenza (di )?/, "").replace(/^./, (c) => c.toLowerCase());
    const f = (v, mm) => `<span class="f" ${ED} style="min-width:${mm}mm">${esc(v || "")}</span>`;
    return `<div class="na">
      <div class="na-head">
        <div class="na-visto" ${ED}>Visto, si autorizza<br>IL CAPO ${tec ? "SEZIONE TECNICA" : "OFFICINA"}</div>
        <div ${ED}>CENTRO ADDESTRATIVO AVIAZIONE dell'ESERCITO<br>1° GRUPPO SQUADRONI ADDESTRATIVO “AURIGA”<br>${tec ? "Sezione" : "Squadrone"} Mantenimento Velivoli</div>
      </div>
      <p>OGGETTO: <b>nullaosta licenza.</b></p>
      <p class="na-txt">Il sottoscritto ${f(p.nome && `${p.nome} ${p.cognome.toUpperCase()}`, 60)} chiede che gli venga concessa una licenza di tipo ${f(tipo, 40)}
        con decorrenza dal ${f(dn(a.dal), 28)} al ${f(dn(a.al), 28)} (giorni totali ${f(giorni(a), 12)}, computabili ${f("", 12)}).
        Destinazione ${f(a.luogo, 50)} Prov. ${f("", 12)} dichiara che nel periodo richiesto non è inserito in nessun servizio.</p>
      <div class="na-firma">Firma</div>
      <div class="na-cte" ${ED}>IL COMANDANTE SQD MANTENIMENTO VELIVOLI<br>Cap ing. (AVES) RN Gianmarco ARDIA</div>
      <div class="na-cdt" ${ED}>IL COMANDANTE<br>Ten. Col. c.(AVES) P.O. Andrea SEMINARA</div>
    </div>`;
  }

  // fuori da #app: refresh/render non lo toccano
  function naOpen() {
    const { l } = licList();
    document.body.insertAdjacentHTML("beforeend", `<div id="na">
      <div class="na-bar"><button class="cta" data-act="naPrint"><span>Stampa ${l.length} nullaosta</span><b>${icon("printer")}</b></button>
        <span>Tocca un campo per modificarlo · 2 copie per foglio</span>
        <button class="ghost" data-act="naClose">${icon("x")}<span>Chiudi</span></button></div>
      ${l.map((a) => `<div class="na-page">${nullaosta(a)}<div class="na"></div></div>`).join("")}</div>`);
  }
  // la copia inferiore del foglio = quella superiore con le modifiche fatte a schermo (anche con Ctrl+P)
  addEventListener("beforeprint", () => document.querySelectorAll(".na-page").forEach((p) => (p.lastElementChild.innerHTML = p.firstElementChild.innerHTML)));

  function render(anim) {
    S.me = S.me && byId(S.me.id);
    app.classList.toggle("anim", !!anim);
    if (!S.me) {
      nav.hidden = true;
      app.innerHTML = authView();
      return;
    }
    // Aiutante: solo Licenze · Cte: niente "Io" (figure di controllo, non effettivi)
    const staff = isStaff(S.me) && !isAiut(S.me), views = isAiut(S.me) ? { licenze: licenzeView }
      : { ...(staff && { oggi: oggiView, personale: personaleView, richieste: richiesteView }), ...(!isCte(S.me) && { me: meView }) };
    const v = views[S.view] ? S.view : home(S.me);
    app.classList.toggle("wide", v === "licenze");
    app.innerHTML = header() + pushBar() + views[v]();
    nav.hidden = !staff;
    if (staff) nav.innerHTML = navView(v, views);
    // badge sull'icona dell'app installata (dove supportato): richieste da approvare
    navigator.setAppBadge?.(canApprove(S.me) ? daApprovare().length : 0)?.catch(() => {});
    S.oraSig = oraSig();
  }

  // ad app aperta: ridisegna quando una fascia oraria di oggi inizia o finisce
  const oraSig = () => Store.tables.absences.filter((a) => a.tipo === "orario" && a.cmd !== "no" && a.dal === today() && assente(a, today())).map((a) => a.id).join();
  setInterval(() => { if (S.me && !dlg.open && oraSig() !== S.oraSig) render(); }, 60000);

  /* ---------- sheets ---------- */

  function profileSheet() {
    S.reopen = null;
    const me = S.me;
    sheet(`
      <div class="sh-head"><span class="av lg" style="--c:${statusOf(me.id, today()).c}">${initials(me)}</span>
        <div><b>${esc(me.nome)} ${esc(me.cognome)}</b><small>${esc(ruolo(me) || "Sq. Mantenimento · H7")}</small></div></div>
      ${isStaff(me) ? "" : `<div class="eyebrow grp-l">Gruppo</div>${gruppoSeg(me.gruppo, 'data-change="gruppo"')}`}
      ${pushHint() ? `<p class="push-hint">${icon("bell-slash")}<span>${pushHint()}</span></p>` : ""}
      <form class="form pw-f" id="pwForm" novalidate>
        <div class="eyebrow grp-l">Cambia password</div>
        ${me.hash ? pwField("old", "Password attuale", "current-password") : ""}
        ${pwField("pw", "Nuova password", "new-password")}
        <button class="ghost wide" type="submit">${icon("key")}<span>Cambia password</span></button>
      </form>
      <button class="ghost wide" data-act="logout">${icon("sign-out")}<span>Esci</span></button>`);
  }

  const pwField = (n, ph, ac) => `<div class="pw"><input name="${n}" type="password" placeholder="${ph}" autocomplete="${ac}">
    <button type="button" data-act="eye" aria-label="Mostra password">${icon("eye")}</button></div>`;

  function personSheet(id) {
    const p = byId(id);
    if (!p) return closeSheet();
    const s = statusOf(id, today()), mine = upcoming(id), self = id === S.me.id, adm = isAdmin(S.me);
    // admin, capi, funzioni (Cte/Aiutante) ed eliminazione: solo il comandante
    const cmdTools = !isCmd(S.me) ? "" : `
        <button data-act="admin" data-id="${id}" class="${p.admin ? "on" : ""}" ${self ? "disabled" : ""}>${icon("crown")}<span>Admin</span></button>
        ${p.admin && !self ? Object.entries(GRUPPI).map(([k, l]) =>
          `<button data-act="capo" data-id="${id}" data-g="${k}" class="${p.capo === k ? "on" : ""}">${icon("star")}<span>Capo ${l}</span></button>`).join("") : ""}
        ${self ? "" : Object.entries(FN).map(([k, l]) =>
          `<button data-act="fn" data-id="${id}" data-f="${k}" class="${p.fn === k ? "on" : ""}">${icon(k === "cte" ? "seal-check" : "clipboard-text")}<span>${l}</span></button>`).join("")}
        <button class="danger" data-act="remove" data-id="${id}" ${self ? "disabled" : ""}>${icon("trash")}<span>Elimina</span></button>`;
    sheet(`
      <div class="sh-head"><span class="av lg" style="--c:${s.c}">${initials(p)}</span>
        <div><b>${esc(fullName(p))}</b><small>${[s.l, ruolo(p)].filter(Boolean).join(" · ")}</small></div></div>
      ${adm || self ? `<button class="cta wide" data-act="add" data-who="${id}"><span>Nuovo impegno</span><b>${icon("plus")}</b></button>` : ""}
      ${mine.length ? `<div class="list mt">${mine.map(actRow).join("")}</div>` : ""}
      ${adm ? `<div class="tools">
        <button data-act="reset" data-id="${id}">${icon("key")}<span>Reset password</span></button>${cmdTools}
      </div>` : ""}`);
    S.reopen = () => personSheet(id);
  }

  function addSheet(who) {
    S.back = S.reopen;
    S.reopen = null;
    const p = who && byId(who), multi = !p;
    const d = multi && S.view === "oggi" ? S.day : today();
    sheet(`
      <form id="addForm" class="add" novalidate>
        <h3>${multi ? "Assegna" : p.id === S.me.id ? "Nuovo impegno" : esc(fullName(p))}</h3>
        ${multi ? `<div class="chi">
          <button type="button" class="chi-btn" data-act="chi">${icon("users-three")}<span class="chi-l">Chi</span><b class="chi-n"></b>${icon("caret-down")}</button>
          <div class="chi-pane">
            <div class="search">${icon("magnifying-glass")}<input type="search" placeholder="Cerca" data-input="q" autocomplete="off"></div>
            <label class="chi-r all" data-name=""><input type="checkbox" data-change="all"><span class="av">${icon("users-three")}</span><span>Tutti</span>${icon("check")}</label>
            <div class="chi-list">${people().map((x) => `<label class="chi-r" data-name="${esc(norm(fullName(x) + " " + x.nome + " " + x.cognome))}">
              <input type="checkbox" name="p" value="${x.id}"><span class="av">${initials(x)}</span><span>${esc(fullName(x))}</span>${icon("check")}</label>`).join("")}</div>
          </div>
        </div>` : `<input type="hidden" name="p" value="${p.id}">`}
        <div class="tipi">${Object.entries(TIPI).map(([k, t]) =>
          `<label class="tipo" style="--c:${t.c}"><input type="radio" name="tipo" value="${k}">${icon(t.i)}<span>${t.l}</span></label>`).join("")}</div>
        <div class="lic">
          <select name="sub" aria-label="Tipo di licenza" required><option value="">Tipo di licenza</option>${Object.entries(LIC).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
          <input name="luogo" placeholder="Luogo di fruizione" autocapitalize="words" enterkeyhint="next">
        </div>
        <div class="dates">
          <label><small>Dal</small><input type="date" name="dal" value="${d}"></label>
          <label class="d-al"><small>Al</small><input type="date" name="al" value="${d}" min="${d}"></label>
        </div>
        <div class="dates ore">
          <label><small>Dalle</small><input type="time" name="dalle" step="900"></label>
          <label><small>Alle</small><input type="time" name="alle" step="900"></label>
        </div>
        <textarea name="note" rows="2" placeholder="Note"></textarea>
        <button class="cta wide" type="submit"><span>Salva</span><b>${icon("check")}</b></button>
      </form>`);
  }

  // Etichetta del campo "Chi": primi 2 cognomi + contatore, "Tutti" se tutti
  function chiSync(w) {
    const c = [...w.querySelectorAll("[name=p]")], on = c.filter((x) => x.checked);
    w.querySelector("[data-change=all]").checked = on.length === c.length;
    w.querySelector(".chi-l").textContent = !on.length ? "Chi" : on.length === c.length ? "Tutti"
      : on.slice(0, 2).map((x) => { const p = byId(x.value); return `${p.cognome} ${p.nome[0] || ""}.`; }).join(", ");
    w.querySelector(".chi-n").textContent = on.length || "";
    w.classList.toggle("set", on.length > 0);
  }

  /* ---------- actions ---------- */

  const editPerson = (id, fn, msg) =>
    Store.mutate("personnel", (l) => { const x = l.find((p) => p.id === id); if (!x) throw new Error("Non trovato"); fn(x); }, msg);

  function afterChange() {
    render();
    if (dlg.open && S.reopen) S.reopen();
  }

  function login(p) {
    localStorage.setItem(KEY, p.id);
    S.me = p;
    S.view = home(p);
    render(true);
    ensureSub().catch(() => {});
  }

  async function doAuth(f) {
    const nome = title(f.elements.nome.value), cognome = title(f.elements.cognome.value), pw = f.elements.pw.value;
    if (!nome || !cognome || !pw) throw new Error("Compila tutti i campi");
    const same = (p) => norm(p.nome) === norm(nome) && norm(p.cognome) === norm(cognome);
    await Store.loadAll();

    if (f.dataset.mode === "reg") {
      const gruppo = f.elements.gruppo.value;
      if (!gruppo) throw new Error("Scegli il gruppo");
      const salt = uid(), h = await hash(pw, salt);
      const p = await Store.mutate("personnel", (l) => {
        if (l.some(same)) throw new Error("Già registrato: usa Accedi");
        const p = { id: uid(), nome, cognome, gruppo, salt, hash: h, createdAt: new Date().toISOString() };
        l.push(p);
        return p;
      }, `registra ${cognome} ${nome}`);
      return login(p);
    }

    const p = Store.tables.personnel.find(same);
    if (!p) throw new Error("Non registrato");
    if (!p.hash) {
      // ponytail: primo accesso o password azzerata dal comando → la password digitata diventa quella nuova
      const salt = uid(), h = await hash(pw, salt);
      await editPerson(p.id, (x) => { x.salt = salt; x.hash = h; }, `password ${cognome} ${nome}`);
      toast("Password impostata");
    } else if ((await hash(pw, p.salt)) !== p.hash) {
      throw new Error("Password errata");
    }
    login(byId(p.id));
  }

  async function doPw(f) {
    const me = S.me, old = f.elements.old?.value, pw = f.elements.pw.value;
    if (!pw || (me.hash && !old)) throw new Error("Compila tutti i campi");
    if (me.hash && (await hash(old, me.salt)) !== me.hash) throw new Error("Password attuale errata");
    const salt = uid(), h = await hash(pw, salt);
    await editPerson(me.id, (x) => { x.salt = salt; x.hash = h; }, `password ${me.cognome} ${me.nome}`);
    closeSheet();
    toast("Password cambiata");
  }

  async function doAdd(f) {
    const ids = [...f.querySelectorAll("[name=p]")].filter((c) => c.type === "hidden" || c.checked).map((c) => c.value);
    const t = f.elements.tipo.value, note = f.elements.note.value.trim(), dal = f.elements.dal.value;
    const orario = t === "orario", dalle = f.elements.dalle.value, alle = f.elements.alle.value;
    const lic = t === "licenza", sub = f.elements.sub.value, luogo = f.elements.luogo.value.trim();
    const al = orario || f.elements.al.value < dal ? dal : f.elements.al.value;
    if (!ids.length) { f.querySelector(".chi")?.classList.add("open"); throw new Error("Scegli chi"); }
    if (!t) throw new Error("Scegli il tipo");
    if (lic && !sub) throw new Error("Scegli il tipo di licenza");
    if (!dal) throw new Error("Scegli la data");
    if (lic && MEDICA.includes(sub) && dal > addDays(today(), 1)) throw new Error("Riposo medico e convalescenza: al massimo dal giorno dopo");
    if (orario && !(dalle && alle && dalle < alle)) throw new Error("Scegli le ore: dalle … alle");
    if ((t === "altro" || (lic && sub === "altra")) && !note) throw new Error("Scrivi una nota");
    if (!isAdmin(S.me) && ids.some((id) => id !== S.me.id)) throw new Error("Non autorizzato");
    const r = { tipo: t, dal, al, note, by: S.me.id, at: new Date().toISOString() };
    if (orario) Object.assign(r, { dalle, alle });
    if (lic) Object.assign(r, { sub, ...(luogo && { luogo }) });
    if (isCmd(S.me)) r.cmd = "si"; // il comandante non attende approvazione
    else if (!isAdmin(S.me) && grp(S.me)) r.gruppo = grp(S.me); // utente: lo vede anche il capo del suo gruppo
    await Store.mutate("absences", (l) => {
      ids.forEach((pid) => l.push({ id: uid(), personId: pid, ...r }));
    }, `${lic ? LIC[sub] : TIPI[t].l} ${dal}${al !== dal ? "→" + al : ""}${orario ? ` ${dalle}-${alle}` : ""} ×${ids.length}`);
    const back = S.back;
    render();
    back ? back() : closeSheet();
    toast(r.cmd ? (lic ? "Salvato · in attesa del Cte di Gruppo" : "Salvato") : "Inviato per approvazione");
  }

  async function refresh() {
    await Store.loadAll();
    S.last = Date.now();
    afterChange();
  }

  const ACT = {
    mode(t) {
      const f = t.form, reg = t.dataset.m === "reg";
      f.dataset.mode = t.dataset.m;
      f.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b === t));
      $(".cta span", f).textContent = reg ? "Crea account" : "Entra";
      f.elements.pw.autocomplete = reg ? "new-password" : "current-password";
    },
    eye(t) {
      const i = t.previousElementSibling;
      i.type = i.type === "password" ? "text" : "password";
      t.innerHTML = icon(i.type === "password" ? "eye" : "eye-slash");
    },
    view(t) { S.view = t.dataset.v; render(true); scrollTo(0, 0); },
    day(t) { S.day = addDays(S.day, +t.dataset.n); render(true); },
    today() { S.day = today(); render(true); },
    filtro(t) { S.grp = t.dataset.g; render(true); },
    pick(t) { if (matchMedia("(pointer: fine)").matches) try { t.showPicker(); } catch (_) {} },
    chi(t) { t.parentNode.classList.toggle("open"); },
    refresh: (t) => run(t, refresh),
    retry: () => boot(),
    profile: profileSheet,
    close: closeSheet,
    add: (t) => addSheet(t.dataset.who),
    person: (t) => personSheet(t.dataset.id),
    del: (t) => run(t, async () => {
      await Store.mutate("absences", (l) => { const i = l.findIndex((a) => a.id === t.dataset.id); if (i >= 0) l.splice(i, 1); }, "elimina impegno");
      afterChange();
    }),
    ok: (t) => run(t, async () => {
      const v = t.dataset.v;
      await Store.mutate("absences", (l) => {
        const a = l.find((x) => x.id === t.dataset.id);
        if (!a || !pend(a)) throw new Error("Richiesta non più in attesa");
        decide(a, v);
      }, `approvazione ${v}`);
      afterChange();
      toast(v === "si" ? "Accettato" : "Rifiutato");
    }),
    okAll: (t) => run(t, async () => {
      const ids = new Set(daApprovare().map((a) => a.id));
      const n = await Store.mutate("absences", (l) => {
        const m = l.filter((a) => ids.has(a.id) && pend(a));
        if (!m.length) throw new Error("Niente da approvare");
        m.forEach((a) => decide(a, "si"));
        return m.length;
      }, `approva tutto ×${ids.size}`);
      afterChange();
      toast(n + (n === 1 ? " approvata" : " approvate"));
    }),
    lic(t) { S.lic = t.dataset.f; render(); },
    stampa: () => { $("#na")?.remove(); naOpen(); },
    naPrint: () => print(),
    naClose: () => $("#na")?.remove(),
    fatta: (t) => run(t, async () => {
      const done = await Store.mutate("absences", (l) => {
        const a = l.find((x) => x.id === t.dataset.id);
        if (!a || !licOk(a)) throw new Error("Licenza non trovata");
        if (a.fatta) { delete a.fatta; delete a.fattaAt; } else { a.fatta = true; a.fattaAt = new Date().toISOString(); }
        return !!a.fatta;
      }, "licenza registrata");
      render();
      toast(done ? "Licenza registrata" : "Rimessa da fare");
    }),
    fn: (t) => run(t, async () => {
      const k = t.dataset.f;
      await editPerson(t.dataset.id, (x) => { if (x.fn === k) delete x.fn; else x.fn = k; }, `funzione ${k}`);
      afterChange();
    }),
    reset: (t) => run(t, async () => {
      await editPerson(t.dataset.id, (x) => { delete x.hash; delete x.salt; }, "reset password");
      toast("Password azzerata: al prossimo accesso ne sceglie una nuova");
    }),
    admin: (t) => run(t, async () => {
      await editPerson(t.dataset.id, (x) => { if (x.admin) { delete x.admin; delete x.capo; } else x.admin = true; }, "ruolo admin");
      afterChange();
    }),
    capo: (t) => run(t, async () => {
      const g = t.dataset.g;
      await Store.mutate("personnel", (l) => {
        const x = l.find((p) => p.id === t.dataset.id);
        if (!x || !x.admin) throw new Error("Solo tra gli admin");
        const on = x.capo !== g;
        l.forEach((p) => { if (p.capo === g) delete p.capo; }); // un solo capo per gruppo
        if (on) x.capo = g;
      }, `capo ${g}`);
      afterChange();
    }),
    remove(t) {
      const p = byId(t.dataset.id);
      if (!p || !confirm(`Eliminare ${fullName(p)}?`)) return;
      run(t, async () => {
        await Store.mutate("personnel", (l) => { const i = l.findIndex((x) => x.id === p.id); if (i >= 0) l.splice(i, 1); }, `elimina ${fullName(p)}`);
        await Store.mutate("absences", (l) => { for (let i = l.length; i--; ) if (l[i].personId === p.id) l.splice(i, 1); }, `elimina impegni ${fullName(p)}`);
        closeSheet();
        render();
      });
    },
    push: (t) => run(t, async () => { await ensureSub(true); render(); toast("Notifiche attive"); }),
    logout() {
      // il dispositivo smette di ricevere; l'endpoint rimasto in personnel risponde 410 e l'invio lo salta
      navigator.serviceWorker?.ready.then((r) => r.pushManager?.getSubscription()).then((s) => s?.unsubscribe()).catch(() => {});
      localStorage.removeItem(KEY); S.me = null; closeSheet(); render(true);
    }
  };

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (t && !t.disabled && ACT[t.dataset.act]) ACT[t.dataset.act](t, e);
  });

  document.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, fn = { authForm: doAuth, addForm: doAdd, pwForm: doPw }[f.id];
    if (fn) run(f.querySelector("[type=submit]"), () => fn(f));
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.change === "day" && t.value) { S.day = t.value; render(true); }
    if (t.dataset.change === "gruppo") run(null, async () => {
      await editPerson(S.me.id, (x) => (x.gruppo = t.value), `gruppo ${S.me.cognome}`);
      render();
      toast("Gruppo: " + GRUPPI[t.value]);
    });
    if (t.dataset.change === "all") t.form.querySelectorAll("[name=p]").forEach((c) => (c.checked = t.checked));
    if (t.closest(".chi")) chiSync(t.closest(".chi"));
    if (t.form?.id === "addForm" && ["dal", "sub", "tipo"].includes(t.name)) dateSync(t.form);
  });

  // "Al" non prima di "Dal"; riposo medico e convalescenza: "Dal" al massimo domani
  function dateSync(f) {
    const { dal, al, tipo, sub } = f.elements;
    dal.max = tipo.value === "licenza" && MEDICA.includes(sub.value) ? addDays(today(), 1) : "";
    if (dal.max && dal.value > dal.max) dal.value = dal.max;
    al.min = dal.value;
    if (al.value < dal.value) al.value = dal.value;
  }

  document.addEventListener("input", (e) => {
    if (e.target.dataset.input !== "q") return;
    const q = norm(e.target.value);
    (e.target.closest(".chi") || app).querySelectorAll("[data-name]").forEach((r) => (r.hidden = !r.dataset.name.includes(q)));
  });

  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeSheet(); });
  // l'evento close arriva in coda: se nel frattempo si è riaperto un altro sheet, non azzerarlo
  dlg.addEventListener("close", () => { if (!dlg.open) S.reopen = S.back = null; });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S.me && Date.now() - S.last > 20000) refresh().catch(() => {});
  });

  async function boot() {
    app.innerHTML = loader;
    try {
      await Store.loadAll();
      S.last = Date.now();
    } catch (e) {
      app.innerHTML = `<div class="boot"><div class="crest">${icon("wrench")}</div><p>${esc(e.message)}</p>
        <button class="ghost" data-act="retry">${icon("arrows-clockwise")}<span>Riprova</span></button></div>`;
      return;
    }
    S.me = byId(localStorage.getItem(KEY)) || null;
    S.view = home(S.me);
    S.day = today();
    render(true);
    ensureSub().catch(() => {});
  }

  boot();
})();
