/* Squadrone — registro presenza / assenze (UI italiana, stile corsi/SIEL). */
(function () {
  "use strict";

  var MOTIVI = [
    { id: "licenze", label: "Licenze" },
    { id: "guardia", label: "Guardia" },
    { id: "polveriera", label: "Polveriera" },
    { id: "72_stormo", label: "72° Stormo" },
    { id: "ritardi", label: "Ritardi" },
    { id: "altro", label: "Altro / note" }
  ];

  var appEl = document.getElementById("app");
  var flashEl = document.getElementById("flash");
  var busyEl = document.getElementById("busy");
  var settingsModal;

  function busy(on) {
    busyEl.classList.toggle("on", !!on);
  }

  function flash(msg, type) {
    if (!msg) {
      flashEl.innerHTML = "";
      return;
    }
    flashEl.innerHTML =
      '<div class="alert alert-' +
      (type || "info") +
      ' alert-dismissible fade show" role="alert">' +
      esc(msg) +
      '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function motivoLabel(id) {
    for (var i = 0; i < MOTIVI.length; i++) {
      if (MOTIVI[i].id === id) return MOTIVI[i].label;
    }
    return id || "—";
  }

  function personName(p) {
    return (p.cognome || "").toUpperCase() + " " + (p.nome || "");
  }

  function sortPeople(list) {
    return list.slice().sort(function (a, b) {
      return personName(a).localeCompare(personName(b), "it");
    });
  }

  function absenceFor(personId, date) {
    date = date || Store.today();
    var abs = Store.tables.absences || [];
    for (var i = 0; i < abs.length; i++) {
      if (abs[i].personId === personId && abs[i].date === date) return abs[i];
    }
    return null;
  }

  function dashboardData(date) {
    date = date || Store.today();
    var people = sortPeople(Store.tables.personnel || []);
    var presenti = [];
    var assenti = [];
    people.forEach(function (p) {
      var a = absenceFor(p.id, date);
      if (a) assenti.push({ person: p, absence: a });
      else presenti.push(p);
    });
    return { people: people, presenti: presenti, assenti: assenti, date: date };
  }

  async function ensureData() {
    if (!Store.hasPat()) {
      openSettings("Inserisci il PAT per collegare squarone-data.");
      throw new Error("PAT mancante");
    }
    busy(true);
    try {
      await Store.loadAll(true);
    } finally {
      busy(false);
    }
  }

  function route() {
    var hash = (location.hash || "#/").replace(/^#/, "") || "/";
    var parts = hash.split("/").filter(Boolean);
    var page = parts[0] || "home";
    flash("");
    if (page === "home") return renderHome();
    if (page === "personale") return renderPersonale();
    if (page === "segna") return renderSegna(parts[1]);
    if (page === "admin") return renderAdmin();
    renderHome();
  }

  function renderHome() {
    document.getElementById("navDate").textContent = formatDateIt(Store.today());
    appEl.innerHTML =
      '<div class="text-center mb-3">' +
      "<h1 class=\"h3 mb-1\" style=\"color:var(--sq-navy);font-weight:800\">Squadrone</h1>" +
      '<p class="text-muted mb-0">Registro presenza — ' +
      esc(formatDateIt(Store.today())) +
      "</p></div>" +
      '<div class="hero-choice">' +
      '<a class="choice-card" href="#/personale">' +
      '<div class="icon"><i class="bi bi-person-badge"></i></div>' +
      "<h2>Personale</h2>" +
      "<p class=\"text-muted mb-0\">Registrati e segna licenze, guardia, impegni</p>" +
      "</a>" +
      '<a class="choice-card" href="#/admin">' +
      '<div class="icon"><i class="bi bi-clipboard-data"></i></div>' +
      "<h2>Comandante</h2>" +
      "<p class=\"text-muted mb-0\">Presenti / assenti e motivi</p>" +
      "</a></div>";
  }

  function formatDateIt(iso) {
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  async function renderPersonale() {
    appEl.innerHTML = '<div class="panel"><p class="mb-0 text-muted">Caricamento…</p></div>';
    try {
      await ensureData();
    } catch (e) {
      appEl.innerHTML =
        '<div class="panel"><a class="back-link" href="#/">← Home</a>' +
        '<p class="text-danger mt-3 mb-0">' +
        esc(e.message) +
        "</p></div>";
      return;
    }

    var people = sortPeople(Store.tables.personnel || []);
    var options =
      '<option value="">— seleziona —</option>' +
      people
        .map(function (p) {
          return (
            '<option value="' +
            esc(p.id) +
            '">' +
            esc(personName(p)) +
            "</option>"
          );
        })
        .join("");

    appEl.innerHTML =
      '<div class="panel">' +
      '<a class="back-link" href="#/">← Home</a>' +
      '<h1 class="h4 mt-2">Personale</h1>' +
      '<p class="text-muted">Scegli il tuo nominativo oppure registrati.</p>' +
      '<label class="form-label">Già registrato</label>' +
      '<select id="selPerson" class="form-select mb-3">' +
      options +
      "</select>" +
      '<button class="btn btn-primary w-100 mb-4" id="btnGoSegna" disabled>Segna impegno / presenza</button>' +
      "<hr>" +
      '<h2 class="h5">Nuova registrazione</h2>' +
      '<div class="row g-2">' +
      '<div class="col-md-6"><label class="form-label">Nome</label>' +
      '<input id="regNome" class="form-control" autocomplete="given-name"></div>' +
      '<div class="col-md-6"><label class="form-label">Cognome</label>' +
      '<input id="regCognome" class="form-control" autocomplete="family-name"></div>' +
      "</div>" +
      '<button class="btn btn-outline-primary w-100 mt-3" id="btnRegistra">Registra e continua</button>' +
      "</div>";

    var sel = document.getElementById("selPerson");
    var btnGo = document.getElementById("btnGoSegna");
    sel.addEventListener("change", function () {
      btnGo.disabled = !sel.value;
    });
    btnGo.addEventListener("click", function () {
      location.hash = "#/segna/" + sel.value;
    });
    document.getElementById("btnRegistra").addEventListener("click", registerPerson);
  }

  async function registerPerson() {
    var nome = document.getElementById("regNome").value.trim();
    var cognome = document.getElementById("regCognome").value.trim();
    if (!nome || !cognome) {
      flash("Inserisci nome e cognome.", "warning");
      return;
    }
    var dup = (Store.tables.personnel || []).some(function (p) {
      return (
        p.nome.toLowerCase() === nome.toLowerCase() &&
        p.cognome.toLowerCase() === cognome.toLowerCase()
      );
    });
    if (dup) {
      flash("Nominativo già presente: selezionarlo dall'elenco.", "warning");
      return;
    }
    var person = {
      id: Store.uid(),
      nome: nome,
      cognome: cognome,
      createdAt: new Date().toISOString()
    };
    busy(true);
    try {
      Store.tables.personnel.push(person);
      await Store.commit(["personnel"], "registra " + cognome + " " + nome);
      flash("Registrato. Ora segna l'impegno o la presenza.", "success");
      location.hash = "#/segna/" + person.id;
    } catch (e) {
      Store.tables.personnel.pop();
      flash(e.message, "danger");
    } finally {
      busy(false);
    }
  }

  async function renderSegna(personId) {
    appEl.innerHTML = '<div class="panel"><p class="mb-0 text-muted">Caricamento…</p></div>';
    try {
      await ensureData();
    } catch (e) {
      appEl.innerHTML =
        '<div class="panel"><a class="back-link" href="#/personale">← Indietro</a>' +
        '<p class="text-danger mt-3 mb-0">' +
        esc(e.message) +
        "</p></div>";
      return;
    }

    var person = (Store.tables.personnel || []).find(function (p) {
      return p.id === personId;
    });
    if (!person) {
      appEl.innerHTML =
        '<div class="panel"><a class="back-link" href="#/personale">← Indietro</a>' +
        '<p class="text-danger mt-3">Nominativo non trovato.</p></div>';
      return;
    }

    var existing = absenceFor(person.id);
    var selected = existing ? existing.motivo : "presente";
    var note = existing && existing.note ? existing.note : "";

    var motivoBtns =
      '<button type="button" class="motivo-btn presente' +
      (selected === "presente" ? " active" : "") +
      '" data-motivo="presente">Presente</button>' +
      MOTIVI.map(function (m) {
        return (
          '<button type="button" class="motivo-btn' +
          (selected === m.id ? " active" : "") +
          '" data-motivo="' +
          m.id +
          '">' +
          esc(m.label) +
          "</button>"
        );
      }).join("");

    appEl.innerHTML =
      '<div class="panel">' +
      '<a class="back-link" href="#/personale">← Indietro</a>' +
      '<h1 class="h4 mt-2">' +
      esc(personName(person)) +
      "</h1>" +
      '<p class="text-muted">Giorno ' +
      esc(formatDateIt(Store.today())) +
      " — cosa segnare?</p>" +
      '<div class="motivo-grid mb-3" id="motivoGrid">' +
      motivoBtns +
      "</div>" +
      '<div id="noteWrap" class="' +
      (selected === "altro" || selected === "ritardi" ? "" : "d-none") +
      '">' +
      '<label class="form-label">Note / dettaglio</label>' +
      '<textarea id="noteText" class="form-control" rows="2" placeholder="Es. visita medica, ritardo rientro…">' +
      esc(note) +
      "</textarea></div>" +
      '<button class="btn btn-success w-100 mt-3" id="btnSalvaSegna">Salva</button>' +
      "</div>";

    var current = selected;
    document.querySelectorAll("#motivoGrid .motivo-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        current = btn.getAttribute("data-motivo");
        document.querySelectorAll("#motivoGrid .motivo-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        var showNote = current === "altro" || current === "ritardi";
        document.getElementById("noteWrap").classList.toggle("d-none", !showNote);
      });
    });

    document.getElementById("btnSalvaSegna").addEventListener("click", async function () {
      var noteVal = (document.getElementById("noteText").value || "").trim();
      if (current === "altro" && !noteVal) {
        flash("Per «Altro» inserisci una nota.", "warning");
        return;
      }
      busy(true);
      try {
        var abs = Store.tables.absences;
        var idx = -1;
        for (var i = 0; i < abs.length; i++) {
          if (abs[i].personId === person.id && abs[i].date === Store.today()) {
            idx = i;
            break;
          }
        }
        if (current === "presente") {
          if (idx >= 0) abs.splice(idx, 1);
        } else {
          var row = {
            id: idx >= 0 ? abs[idx].id : Store.uid(),
            personId: person.id,
            date: Store.today(),
            motivo: current,
            note: noteVal,
            updatedAt: new Date().toISOString()
          };
          if (idx >= 0) abs[idx] = row;
          else abs.push(row);
        }
        await Store.commit(
          ["absences"],
          "segna " + person.cognome + " " + (current === "presente" ? "presente" : current)
        );
        flash(
          current === "presente"
            ? "Segnato presente."
            : "Assenza salvata: " + motivoLabel(current),
          "success"
        );
        location.hash = "#/personale";
      } catch (e) {
        flash(e.message, "danger");
        Store.reset();
        try {
          await Store.loadAll(true);
        } catch (_) {}
      } finally {
        busy(false);
      }
    });
  }

  async function renderAdmin() {
    if (!Store.isAdmin()) {
      appEl.innerHTML =
        '<div class="panel" style="max-width:420px;margin:0 auto">' +
        '<a class="back-link" href="#/">← Home</a>' +
        '<h1 class="h4 mt-2">Accesso comandante</h1>' +
        '<p class="text-muted">Inserisci il PIN amministratore.</p>' +
        '<input type="password" id="adminPin" class="form-control mb-3" placeholder="PIN" inputmode="numeric">' +
        '<button class="btn btn-primary w-100" id="btnAdminLogin">Entra</button></div>';
      document.getElementById("btnAdminLogin").addEventListener("click", function () {
        var pin = document.getElementById("adminPin").value.trim();
        if (pin === Store.cfg.adminPin) {
          Store.setAdmin(true);
          renderAdmin();
        } else {
          flash("PIN non corretto.", "danger");
        }
      });
      return;
    }

    appEl.innerHTML = '<div class="panel"><p class="mb-0 text-muted">Caricamento…</p></div>';
    try {
      await ensureData();
    } catch (e) {
      appEl.innerHTML =
        '<div class="panel"><a class="back-link" href="#/">← Home</a>' +
        '<p class="text-danger mt-3 mb-0">' +
        esc(e.message) +
        "</p></div>";
      return;
    }

    var dash = dashboardData();
    var listHtml;
    if (!dash.assenti.length) {
      listHtml = '<p class="text-muted mb-0">Nessun assente oggi.</p>';
    } else {
      listHtml = dash.assenti
        .map(function (row) {
          var detail =
            row.absence.note && row.absence.note.trim()
              ? " — " + esc(row.absence.note)
              : "";
          return (
            '<div class="person-row">' +
            "<div><strong>" +
            esc(personName(row.person)) +
            '</strong><div class="small text-muted">' +
            esc(motivoLabel(row.absence.motivo)) +
            detail +
            "</div></div>" +
            '<span class="badge-motivo">' +
            esc(motivoLabel(row.absence.motivo)) +
            "</span></div>"
          );
        })
        .join("");
    }

    var presentiList = dash.presenti.length
      ? '<details class="mt-3"><summary class="text-muted">Elenco presenti (' +
        dash.presenti.length +
        ")</summary><ul class=\"mt-2 mb-0\">" +
        dash.presenti
          .map(function (p) {
            return "<li>" + esc(personName(p)) + "</li>";
          })
          .join("") +
        "</ul></details>"
      : "";

    appEl.innerHTML =
      '<div class="panel">' +
      '<div class="d-flex justify-content-between align-items-start gap-2">' +
      '<div><a class="back-link" href="#/">← Home</a>' +
      '<h1 class="h4 mt-2 mb-0">Pannello comandante</h1>' +
      '<p class="text-muted mb-0">' +
      esc(formatDateIt(dash.date)) +
      " · " +
      dash.people.length +
      " in organico</p></div>" +
      '<button class="btn btn-sm btn-outline-secondary" id="btnLogoutAdmin">Esci</button></div>' +
      '<div class="stat-grid mt-3">' +
      '<div class="stat presenti"><div class="n">' +
      dash.presenti.length +
      '</div><div class="l">Presenti</div></div>' +
      '<div class="stat assenti"><div class="n">' +
      dash.assenti.length +
      '</div><div class="l">Assenti</div></div></div>' +
      "<h2 class=\"h5\">Assenti e motivo</h2>" +
      listHtml +
      presentiList +
      '<div class="mt-3 d-flex gap-2 flex-wrap">' +
      '<button class="btn btn-outline-primary btn-sm" id="btnRefresh">Aggiorna</button>' +
      "</div></div>";

    document.getElementById("btnLogoutAdmin").addEventListener("click", function () {
      Store.setAdmin(false);
      location.hash = "#/";
    });
    document.getElementById("btnRefresh").addEventListener("click", function () {
      Store.reset();
      renderAdmin();
    });
  }

  function openSettings(msg) {
    document.getElementById("set_pat").value = localStorage.getItem(Store.LS.pat) || "";
    document.getElementById("set_owner").value = Store.cfg.owner;
    document.getElementById("set_repo").value = Store.cfg.repo;
    document.getElementById("set_branch").value = Store.cfg.branch;
    document.getElementById("set_err").textContent = msg || "";
    document.getElementById("set_ok").textContent = "";
    settingsModal.show();
  }

  async function saveSettings() {
    var pat = document.getElementById("set_pat").value.trim();
    var owner = document.getElementById("set_owner").value.trim() || "rdagmr98";
    var repo = document.getElementById("set_repo").value.trim() || "squadrone-data";
    var branch = document.getElementById("set_branch").value.trim() || "main";
    var err = document.getElementById("set_err");
    var ok = document.getElementById("set_ok");
    err.textContent = "";
    ok.textContent = "";

    Store.cfg.pat = pat;
    Store.cfg.owner = owner;
    Store.cfg.repo = repo;
    Store.cfg.branch = branch;
    Store.reset();

    if (!Store.hasPat()) {
      err.textContent = "Inserisci un PAT con Contents Read/Write su squarone-data.";
      return;
    }
    busy(true);
    try {
      await Store.loadAll(true);
      ok.textContent = "Connessione OK — " + Store.tables.personnel.length + " in organico.";
      setTimeout(function () {
        settingsModal.hide();
        route();
      }, 600);
    } catch (e) {
      err.textContent = e.message;
    } finally {
      busy(false);
    }
  }

  function init() {
    settingsModal = new bootstrap.Modal(document.getElementById("settingsModal"));
    document.getElementById("btnSettings").addEventListener("click", function () {
      openSettings();
    });
    document.getElementById("set_save").addEventListener("click", saveSettings);
    document.getElementById("navDate").textContent = formatDateIt(Store.today());
    window.addEventListener("hashchange", route);
    route();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
