/* Squadrone Mantenimento · H7 — presenze da cellulare. */
(function () {
  "use strict";

  const TIPI = {
    licenza: { l: "Licenza", i: "suitcase-rolling", c: "#22d3ee" },
    guardia: { l: "Guardia", i: "shield-star", c: "#fbbf24" },
    polveriera: { l: "Polveriera", i: "warehouse", c: "#fb7185" },
    stormo72: { l: "Servizio isolato", i: "map-pin-line", c: "#60a5fa" }, // chiave storica: i record salvati restano validi
    orario: { l: "Assenza oraria", i: "clock-countdown", c: "#fb923c" },
    altro: { l: "Altro", i: "note-pencil", c: "#a78bfa" },
    // creato in automatico col giorno dopo la guardia, non si sceglie a mano
    rco: { l: "Recupero compensativo obbligatorio (RCO)", i: "bed", c: "#a3e635" }
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
  // lq/lg/lt/ls = cerca, gruppo, tipo e ordine delle Licenze · sel = id scelti per la stampa dei nullaosta
  const S = { me: null, view: "me", day: null, grp: "", lic: "todo", lq: "", lg: "", lt: "", ls: "dal", sel: new Set(), reopen: null, back: null, last: 0 };

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
  // il capo conta nel gruppo che comanda (totali Oggi); gli altri admin e le funzioni restano fuori
  const grp = (p) => capoDi(p) || (isAdmin(p) || FN[p.fn] || !GRUPPI[p.gruppo] ? null : p.gruppo);
  const capoDi = (p) => (p && p.admin && GRUPPI[p.capo] ? p.capo : null);
  const ruolo = (p) => isCmd(p) ? "Comandante" : [capoDi(p) ? "Capo " + GRUPPI[p.capo] : p.admin ? "Admin" : "", FN[p.fn]].filter(Boolean).join(" · ") || GRUPPI[grp(p)] || "";
  const home = (p) => (isAiut(p) ? "licenze" : isStaff(p) ? "oggi" : "me");
  // Impegno: cmd = decisione finale del comandante · capo = parere del capo gruppo (solo se inserito da un utente con gruppo)
  // Licenza: accettata col sì del comandante; il Cte di Gruppo (cte) può solo rifiutarla dopo · poi l'Aiutante Maggiore la registra (fatta)
  const stato = (a) => (a.tipo === "licenza" && a.cmd === "si" ? (a.cte === "no" ? "no" : "si") : a.cmd || "attesa");
  const stTag = (s, txt = ST[s]) => ` <span class="st ${s}">${txt}</span>`;
  const badge = (a) => (stato(a) === "si" ? "" : stTag(stato(a)));
  const canApprove = (p) => isCmd(p) || !!capoDi(p) || isCte(p);
  // coda del Cte di Gruppo: solo licenze già accettate dal comandante
  const daCte = (a) => a.tipo === "licenza" && a.cmd === "si" && !a.cte;
  const pend = (a) => !!byId(a.personId) && ((!a.cmd && (isCmd(S.me) || (a.gruppo && !a.capo && a.gruppo === capoDi(S.me)))) || (isCte(S.me) && daCte(a)));
  const daApprovare = () => Store.tables.absences.filter(pend);
  const qKey = (a) => (a.cmd === "si" ? "cte" : isCmd(S.me) ? "cmd" : "capo");
  const decide = (a, v) => { const k = qKey(a); a[k] = v; a[k + "At"] = new Date().toISOString(); };
  const canDel = (a) => isAdmin(S.me) || a.personId === S.me.id;
  const dt = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  // all'Aiutante appena approvata dal comandante; il parere del Cte di Gruppo è mostrato a parte
  const licOk = (a) => a.tipo === "licenza" && a.cmd === "si" && byId(a.personId);
  const daFare = (a) => !a.fatta && a.cte !== "no";
  const giorni = (a) => Math.round((parse(a.al) - parse(a.dal)) / 864e5) + 1;
  // computabili = giorni lavorativi: esclusi sabato, domenica, festivi nazionali, Pasquetta e Santa Rosa (4/9, patrono di Viterbo)
  const FEST = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "09-04", "11-01", "12-08", "12-25", "12-26"];
  const pasquetta = (y) => { // Pasqua gregoriana (Meeus) + 1 giorno
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
    const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7, n = h + l - 7 * Math.floor((a + 11 * h + 22 * l) / 451) + 114;
    return iso(new Date(y, Math.floor(n / 31) - 1, (n % 31) + 2));
  };
  const computabili = (a) => {
    let n = 0;
    for (let s = a.dal; s <= a.al; s = addDays(s, 1)) { const d = parse(s); if (d.getDay() % 6 && !FEST.includes(s.slice(5)) && s !== pasquetta(d.getFullYear())) n++; }
    return n;
  };
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
      stato(a) === "si" ? "" : a.cmd ? ST[stato(a)] : "In attesa di approvazione", a.note ? esc(a.note) : ""].filter(Boolean) : [];
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
        <span class="row-t"><b>${esc(fullName(p))}</b><small>${[...new Set(acts.map(tl))].join(" + ")}${when ? " · " + when : ""}${w ? stTag("attesa") : ""}</small>${notes ? `<em>${esc(notes)}</em>` : ""}</span>
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

  // Aiutante Maggiore (desktop 16:9): licenze approvate dal comandante, da registrare; "fatta" = già lavorata
  // rifiutate dal Cte di Gruppo: non da fare, restano solo in "Tutte"
  const dn = (s) => fmt(s, { day: "2-digit", month: "2-digit", year: "numeric" });
  const CTE = { si: "Approvata", no: "Rifiutata" };
  const nome = (a) => fullName(byId(a.personId));
  const SORT = {
    dal: ["Data ↑", (a, b) => a.dal.localeCompare(b.dal) || a.at.localeCompare(b.at)],
    dalD: ["Data ↓", (a, b) => b.dal.localeCompare(a.dal) || b.at.localeCompare(a.at)],
    az: ["Nome A-Z", (a, b) => nome(a).localeCompare(nome(b), "it")],
    za: ["Nome Z-A", (a, b) => nome(b).localeCompare(nome(a), "it")],
    at: ["Ultime inserite", (a, b) => b.at.localeCompare(a.at)]
  };
  const licList = () => {
    const all = Store.tables.absences.filter(licOk), f = S.lic, q = norm(S.lq);
    const l = all.filter((a) => {
      const p = byId(a.personId);
      return (f === "todo" ? daFare(a) : f === "done" ? a.fatta : true) && (!S.lg || grp(p) === S.lg) && (!S.lt || a.sub === S.lt)
        && (!q || norm([fullName(p), p.nome, p.cognome, a.luogo, a.prov, a.note, LIC[a.sub]].join(" ")).includes(q));
    }).sort((SORT[S.ls] || SORT.dal)[1]);
    // si stampano solo le scelte tra quelle visibili: quello che si vede è quello che esce
    return { all, l, sel: l.filter((a) => S.sel.has(a.id)) };
  };
  const opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? "selected" : ""}>${esc(Array.isArray(l) ? l[0] : l)}</option>`).join("");

  function licenzeView() {
    const { all, l, sel } = licList(), todo = all.filter(daFare).length, fatte = all.filter((a) => a.fatta).length, f = S.lic;
    const row = (a, i) => {
      const p = byId(a.personId), by = a.by !== a.personId && byId(a.by);
      const iter = [by && `Inserita da ${fullName(by)} ${dt(a.at)}`, a.cmdAt && `Comandante ${dt(a.cmdAt)}`, a.cteAt && `Cte di Gruppo ${dt(a.cteAt)}`, a.fatta && `Registrata ${dt(a.fattaAt)}`];
      // ponytail: celle vuote senza "—": su mobile spariscono (:empty), su desktop il trattino lo mette il CSS
      return `<div class="lic-r rise" style="--d:${Math.min(i, 8) + 2}">
        <input type="checkbox" class="sel" data-change="sel" value="${a.id}" ${S.sel.has(a.id) ? "checked" : ""} aria-label="Stampa nullaosta">
        <button class="chk" data-act="fatta" data-id="${a.id}" title="${a.fatta ? "Rimetti da fare" : "Segna come fatta"}" aria-pressed="${!!a.fatta}">${a.fatta ? "Fatta" : "Da fare"}</button>
        <span data-l="Nominativo"><b>${esc(fullName(p))}</b><small>${esc(ruolo(p))}</small></span>
        <span data-l="Tipo">${esc(LIC[a.sub] || "")}</span>
        <span data-l="Luogo">${esc(a.luogo || "")}</span>
        <span data-l="Dal">${dn(a.dal)}</span>
        <span data-l="Al">${dn(a.al)}</span>
        <span data-l="Giorni">${giorni(a)}</span>
        <span data-l="Cte di Gruppo">${a.cte ? stTag(a.cte, CTE[a.cte]) : ""}</span>
        <span data-l="Note">${esc(a.note || "")}</span>
        <span data-l="Iter">${iter.filter(Boolean).map((x) => `<small>${esc(x)}</small>`).join("")}</span>
      </div>`;
    };
    return `<h2 class="sec rise">Licenze<b>${todo}</b></h2>
      <div class="seg grp lic-f rise">${[["todo", `Da fare ${todo}`], ["done", `Fatte ${fatte}`], ["all", `Tutte ${all.length}`]].map(([k, t]) =>
        `<button data-act="lic" data-f="${k}" class="${f === k ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="lic-tools rise">
        <div class="search">${icon("magnifying-glass")}<input type="search" placeholder="Cerca" data-input="lq" value="${esc(S.lq)}" autocomplete="off"></div>
        <select data-change="lg" aria-label="Gruppo"><option value="">Tutti i gruppi</option>${opts(GRUPPI, S.lg)}</select>
        <select data-change="lt" aria-label="Tipo di licenza"><option value="">Tutti i tipi</option>${opts(LIC, S.lt)}</select>
        <select data-change="ls" aria-label="Ordina">${opts(SORT, S.ls)}</select>
      </div>
      ${l.length ? `<div class="lic-sel rise">
        <label><input type="checkbox" data-change="selAll" ${sel.length === l.length ? "checked" : ""}><span>Seleziona tutte (${l.length})</span></label>
        <button class="ghost" data-act="stampa" ${sel.length ? "" : "disabled"}>${icon("printer")}<span>Stampa nullaosta (${sel.length})</span></button></div>
        <div class="lic-h"><span></span><span>Stato</span><span>Nominativo</span><span>Tipo</span><span>Luogo</span><span>Dal</span><span>Al</span><span>Giorni</span><span>Cte di Gruppo</span><span>Note</span><span>Iter</span></div>
        <div class="list">${l.map(row).join("")}</div>` : `<p class="empty rise" style="--d:1">${S.lq || S.lg || S.lt ? "Nessun risultato" : f === "done" ? "Nessuna licenza registrata" : "Nessuna licenza da registrare"}</p>`}`;
  }

  // nullaosta cartaceo (4 per A4, si taglia in quarti, copia unica): campi .f precompilati e modificabili sul singolo foglietto;
  // i testi fissi (data-k) sono il modello in db/modello.json: modificarne uno cambia tutti i nullaosta, anche i futuri
  const ED = 'contenteditable spellcheck="false"';
  const ENTE = "CENTRO ADDESTRATIVO AVIAZIONE dell'ESERCITO\n1° GRUPPO SQUADRONI ADDESTRATIVO “AURIGA”\n";
  const DEF = {
    "visto.officina": "Visto, si autorizza\nIL CAPO OFFICINA", "visto.tecnica": "Visto, si autorizza\nIL CAPO SEZIONE TECNICA",
    "ente.officina": ENTE + "Squadrone Mantenimento Velivoli", "ente.tecnica": ENTE + "Sezione Mantenimento Velivoli",
    ogg: "OGGETTO:", ogg2: "nullaosta licenza.", t0: "Il sottoscritto", t1: "chiede che gli venga concessa una licenza di tipo", t2: "con decorrenza dal",
    t3: "al", t4: "(giorni totali", t5: ", computabili", t6: "). Destinazione", t7: "Prov.", t8: "dichiara che nel periodo richiesto non è inserito in nessun servizio.",
    cte: "IL COMANDANTE SQD MANTENIMENTO VELIVOLI\nCap ing. (AVES) RN Gianmarco ARDIA", cdt: "IL COMANDANTE\nTen. Col. c.(AVES) P.O. Andrea SEMINARA"
  };
  const mod = (k) => Store.tables.modello[k] ?? DEF[k];
  const T = (k, tag = "span", c = "") => `<${tag}${c && ` class="${c}"`} data-k="${k}" ${ED}>${esc(mod(k)).replace(/\n/g, "<br>")}</${tag}>`;
  // sigla "a penna" con le iniziali: grafia e inclinazione fisse per persona (dal suo id), fuori dai data-k così non finisce nel modello
  const PENNE = ["Herr Von Muellerhoff", "Mrs Saint Delafield", "La Belle Aurore"];
  const sigla = (p) => {
    if (!p) return "";
    const h = [...p.id].reduce((s, c) => (Math.imul(s, 31) + c.charCodeAt(0)) >>> 0, 7);
    return `<span class="sig" aria-hidden="true" style="font-family:'${PENNE[h % 3]}',cursive;--r:${-3 - (h % 9)}deg">${esc(initials(p))}<svg viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M2 ${12 + (h % 6)} C 30 ${20 - (h % 5)}, 62 2, 98 ${5 + (h % 7)}"/></svg></span>`;
  };
  function nullaosta(a) {
    const p = byId(a.personId) || {}, g = p.gruppo === "tecnica" ? "tecnica" : "officina";
    const capo = Store.tables.personnel.find((x) => capoDi(x) === g);
    const tipo = (LIC[a.sub] || "").replace(/^Licenza (di )?/, "").replace(/^./, (c) => c.toLowerCase());
    const f = (v, mm) => `<span class="f" ${ED} style="min-width:${mm}mm">${esc(v ?? "")}</span>`;
    return `<div class="na">
      <div class="na-head"><div class="na-visto">${T("visto." + g, "div")}${sigla(capo)}</div>${T("ente." + g, "div")}</div>
      <p>${T("ogg")} ${T("ogg2", "b")}</p>
      <p class="na-txt">${T("t0")} ${f(p.nome && `${p.nome} ${p.cognome.toUpperCase()}`, 45)} ${T("t1")} ${f(tipo, 28)}
        ${T("t2")} ${f(dn(a.dal), 22)} ${T("t3")} ${f(dn(a.al), 22)} ${T("t4")} ${f(giorni(a), 8)}${T("t5")} ${f(computabili(a), 8)}${T("t6")}
        ${f(a.luogo, 35)} ${T("t7")} ${f(a.prov, 9)} ${T("t8")}</p>
      <div class="na-firme"><div class="na-cte">${T("cte", "div")}${sigla(byId(Store.cfg.cmd))}</div>${T("cdt", "div", "na-cdt")}</div>
    </div>`;
  }

  // fuori da #app: refresh/render non lo toccano
  function naOpen() {
    const { sel } = licList();
    document.body.insertAdjacentHTML("beforeend", `<div id="na">
      <div class="na-bar"><button class="cta" data-act="naPrint"><span>Stampa ${sel.length} nullaosta</span><b>${icon("printer")}</b></button>
        <span>Tocca un campo per modificarlo · 4 per foglio</span>
        <button class="ghost" data-act="naClose">${icon("x")}<span>Chiudi</span></button></div>
      ${sel.map(nullaosta).join("")}</div>`);
  }

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
        <div class="tipi">${Object.entries(TIPI).filter(([k]) => k !== "rco").map(([k, t]) =>
          `<label class="tipo" style="--c:${t.c}"><input type="radio" name="tipo" value="${k}">${icon(t.i)}<span>${t.l}</span></label>`).join("")}</div>
        <div class="lic">
          <select name="sub" aria-label="Tipo di licenza" required><option value="">Tipo di licenza</option>${Object.entries(LIC).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
          <div class="loc"><input name="luogo" placeholder="Destinazione" autocapitalize="words" enterkeyhint="next">
            <input name="prov" placeholder="Prov." aria-label="Provincia" maxlength="2" autocapitalize="characters" enterkeyhint="next"></div>
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
    const lic = t === "licenza", sub = f.elements.sub.value, luogo = f.elements.luogo.value.trim(), prov = f.elements.prov.value.trim().toUpperCase();
    const al = orario || f.elements.al.value < dal ? dal : f.elements.al.value;
    if (!ids.length) { f.querySelector(".chi")?.classList.add("open"); throw new Error("Scegli chi"); }
    if (!t) throw new Error("Scegli il tipo");
    if (lic && !sub) throw new Error("Scegli il tipo di licenza");
    if (lic && !(luogo && /^[A-Z]{2}$/.test(prov))) throw new Error("Scrivi destinazione e provincia (sigla, es. VT)");
    if (!dal) throw new Error("Scegli la data");
    if (lic && MEDICA.includes(sub) && dal > addDays(today(), 1)) throw new Error("Riposo medico e convalescenza: al massimo dal giorno dopo");
    if (orario && !(dalle && alle && dalle < alle)) throw new Error("Scegli le ore: dalle … alle");
    if ((t === "altro" || (lic && sub === "altra")) && !note) throw new Error("Scrivi una nota");
    if (!isAdmin(S.me) && ids.some((id) => id !== S.me.id)) throw new Error("Non autorizzato");
    const r = { tipo: t, dal, al, note, by: S.me.id, at: new Date().toISOString() };
    if (orario) Object.assign(r, { dalle, alle });
    if (lic) Object.assign(r, { sub, ...(luogo && { luogo }), ...(prov && { prov }) });
    if (isCmd(S.me)) r.cmd = "si"; // il comandante non attende approvazione
    else if (!isAdmin(S.me) && grp(S.me)) r.gruppo = grp(S.me); // utente: lo vede anche il capo del suo gruppo
    await Store.mutate("absences", (l) => {
      ids.forEach((pid) => {
        const id = uid(), g = addDays(al, 1);
        l.push({ id, personId: pid, ...r });
        // guardia → RCO il giorno dopo: senza gruppo né licenza, quindi niente capo, Cte e nullaosta; decide (e riceve la notifica) solo il comandante
        if (t === "guardia") l.push({ id: uid(), personId: pid, tipo: "rco", dal: g, al: g, note: "", by: r.by, at: r.at, rif: id, ...(r.cmd && { cmd: "si" }) });
      });
    },`${lic ? LIC[sub] : TIPI[t].l} ${dal}${al !== dal ? "→" + al : ""}${orario ? ` ${dalle}-${alle}` : ""} ×${ids.length}`);
    const back = S.back;
    render();
    back ? back() : closeSheet();
    toast(r.cmd ? "Salvato" : "Inviato per approvazione");
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
      // con la guardia se ne va anche il suo RCO (rif)
      await Store.mutate("absences", (l) => { for (let i = l.length; i--; ) if (l[i].id === t.dataset.id || l[i].rif === t.dataset.id) l.splice(i, 1); }, "elimina impegno");
      afterChange();
    }),
    ok: (t) => run(t, async () => {
      const v = t.dataset.v;
      await Store.mutate("absences", (l) => {
        const a = l.find((x) => x.id === t.dataset.id);
        if (!a || !pend(a)) throw new Error("Richiesta non più in attesa");
        decide(a, v);
        // guardia rifiutata dal comandante: niente RCO del giorno dopo
        if (a.cmd === "no") l.forEach((x) => { if (x.rif === a.id) { x.cmd = "no"; x.cmdAt = a.cmdAt; } });
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
    naPrint: () => document.fonts.ready.then(() => print()), // le grafie delle sigle si scaricano all'apertura
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
    if (t.dataset.change === "sel") { S.sel[t.checked ? "add" : "delete"](t.value); render(); }
    if (t.dataset.change === "selAll") { licList().l.forEach((a) => S.sel[t.checked ? "add" : "delete"](a.id)); render(); }
    if (["lg", "lt", "ls"].includes(t.dataset.change)) { S[t.dataset.change] = t.value; render(); }
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

  // modello nullaosta: mentre si scrive si aggiornano tutte le copie aperte; uscendo dal testo si salva per tutti i nullaosta futuri
  document.addEventListener("input", (e) => {
    const t = e.target, k = t.dataset.k;
    if (k) document.querySelectorAll(`#na [data-k="${k}"]`).forEach((x) => x !== t && (x.innerHTML = t.innerHTML));
  });
  document.addEventListener("focusout", (e) => {
    const k = e.target.dataset?.k, v = k && e.target.innerText.trim();
    if (k && v !== mod(k)) run(null, async () => { await Store.mutate("modello", (m) => { m[k] = v; }, "modello nullaosta"); toast("Modello salvato"); });
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.input !== "lq") return;
    // cerca Licenze: filtra in licList (vale anche per stampa e "Seleziona tutte"), poi rimette il cursore dov'era
    const c = t.selectionStart;
    S.lq = t.value;
    render();
    const i = $("[data-input=lq]");
    i.focus();
    i.setSelectionRange(c, c);
  });

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
