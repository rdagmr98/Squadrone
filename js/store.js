/* Dati: JSON in squadrone-data/db via GitHub Contents API (come corsi/AVES). */
(function (g) {
  "use strict";

  var C = g.SQUADRONE_CONFIG || {};
  var BASE =
    "https://api.github.com/repos/" + (C.owner || "rdagmr98") + "/" +
    (C.repo || "squadrone-data") + "/contents/db/";
  var BRANCH = C.branch || "main";
  var TABLES = ["personnel", "absences"];
  var tables = { personnel: [], absences: [] };

  function gh(name, opts) {
    opts = opts || {};
    opts.cache = "no-store"; // l'API risponde max-age=60: senza, sha vecchio → 409 a raffica
    opts.headers = {
      Authorization: "Bearer " + C.pat,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (opts.body) opts.headers["Content-Type"] = "application/json";
    return g.fetch(BASE + name + ".json" + (opts.method ? "" : "?ref=" + BRANCH), opts);
  }

  function dec(b64) {
    var bin = g.atob(String(b64 || "").replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  }

  function enc(str) {
    var bin = "";
    new TextEncoder().encode(str).forEach(function (b) { bin += String.fromCharCode(b); });
    return g.btoa(bin);
  }

  async function fail(res) {
    var m = "";
    try { m = (await res.json()).message || ""; } catch (_) {}
    if (res.status === 401 || res.status === 403) m = "token non valido";
    return new Error("Errore dati (" + res.status + ") " + m);
  }

  async function read(name) {
    var res = await gh(name);
    if (res.status === 404) return { sha: null, data: [] };
    if (!res.ok) throw await fail(res);
    var j = await res.json();
    var txt = dec(j.content).trim();
    return { sha: j.sha, data: txt ? JSON.parse(txt) : [] };
  }

  async function loadAll() {
    if (!C.pat) throw new Error("Deploy senza token");
    var r = await Promise.all(TABLES.map(read));
    TABLES.forEach(function (t, i) { tables[t] = r[i].data; });
    return tables;
  }

  // fn modifica la copia fresca appena letta; su conflitto (altro utente ha
  // salvato nel frattempo) rilegge e riapplica → nessuna scrittura persa.
  async function mutate(name, fn, message) {
    for (var i = 0; i < 6; i++) {
      var cur = await read(name);
      var out = fn(cur.data);
      var body = {
        message: message || "update " + name,
        content: enc(JSON.stringify(cur.data, null, 2) + "\n"),
        branch: BRANCH
      };
      if (cur.sha) body.sha = cur.sha;
      var res = await gh(name, { method: "PUT", body: JSON.stringify(body) });
      if (res.ok) {
        tables[name] = cur.data;
        return out;
      }
      if (res.status !== 409 && res.status !== 422) throw await fail(res);
      await new Promise(function (r) { setTimeout(r, 300 * (i + 1) + Math.random() * 400); });
    }
    throw new Error("Salvataggio in conflitto, riprova");
  }

  g.Store = { tables: tables, loadAll: loadAll, mutate: mutate, cfg: C };
})(typeof window !== "undefined" ? window : globalThis);
