/* Layer dati: JSON su squarone-data/db via GitHub Git Data API (come SIEL/corsi). */
(function (global) {
  "use strict";

  var API = "https://api.github.com";
  var LS = { admin: "squadrone_admin_ok" };
  var DATA_DIR = "db/";
  var TABLES = ["personnel", "absences"];
  var baked = global.SQUADRONE_CONFIG || {};

  var tables = {
    personnel: [],
    absences: []
  };
  var loaded = false;

  var cfg = {
    get pat() {
      return (baked.pat || "").trim();
    },
    get owner() {
      return baked.owner || "rdagmr98";
    },
    get repo() {
      return baked.repo || "squadrone-data";
    },
    get branch() {
      return baked.branch || "main";
    },
    get adminPin() {
      // PIN solo da config deploy (non da JSON remoto — evita default 1234)
      return String(baked.adminPin || "3108");
    }
  };

  function headers() {
    return {
      Authorization: "Bearer " + cfg.pat,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function rawHeaders() {
    return {
      Authorization: "Bearer " + cfg.pat,
      Accept: "application/vnd.github.raw",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function ghBase() {
    return API + "/repos/" + cfg.owner + "/" + cfg.repo;
  }

  function tablePath(name) {
    return DATA_DIR + name + ".json";
  }

  async function errMsg(res, fallback) {
    var extra = "";
    try {
      var j = await res.json();
      if (j && j.message) extra = ": " + j.message;
    } catch (_) {}
    return fallback + " (HTTP " + res.status + ")" + extra;
  }

  async function readTable(name) {
    var url =
      ghBase() +
      "/contents/" +
      tablePath(name) +
      "?ref=" +
      encodeURIComponent(cfg.branch);
    var res = await fetch(url, { headers: rawHeaders() });
    if (res.status === 404) {
      // migrazione: vecchio path in root
      var legacy =
        ghBase() +
        "/contents/" +
        name +
        ".json?ref=" +
        encodeURIComponent(cfg.branch);
      var res2 = await fetch(legacy, { headers: rawHeaders() });
      if (res2.status === 404) return [];
      if (!res2.ok) throw new Error(await errMsg(res2, "Lettura " + name + " fallita"));
      var t2 = await res2.text();
      if (!t2.trim()) return [];
      try {
        return JSON.parse(t2);
      } catch (e) {
        throw new Error("JSON non valido in " + name + ".json");
      }
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Accesso dati non configurato (HTTP " +
          res.status +
          "). Serve SQUADRONE_PAT nel deploy Actions."
      );
    }
    if (!res.ok) throw new Error(await errMsg(res, "Lettura " + name + " fallita"));
    var txt = await res.text();
    if (!txt.trim()) return [];
    try {
      return JSON.parse(txt);
    } catch (e) {
      throw new Error("JSON non valido in " + tablePath(name));
    }
  }

  async function loadAll(force) {
    if (loaded && !force) return tables;
    if (!cfg.pat) {
      throw new Error(
        "Deploy incompleto: manca il secret SQUADRONE_PAT (o READ_PAT)."
      );
    }
    var results = await Promise.all(TABLES.map(readTable));
    TABLES.forEach(function (t, i) {
      tables[t] = Array.isArray(results[i]) ? results[i] : [];
    });
    loaded = true;
    return tables;
  }

  async function commitOnce(names, message) {
    var refUrl =
      ghBase() + "/git/ref/heads/" + encodeURIComponent(cfg.branch);
    var refRes = await fetch(refUrl, { headers: headers() });
    if (!refRes.ok) throw new Error(await errMsg(refRes, "Ref non trovata"));
    var ref = await refRes.json();
    var baseSha = ref.object.sha;

    var cRes = await fetch(ghBase() + "/git/commits/" + baseSha, {
      headers: headers()
    });
    if (!cRes.ok) throw new Error(await errMsg(cRes, "Commit base non trovato"));
    var baseCommit = await cRes.json();
    var baseTree = baseCommit.tree.sha;

    var treeItems = names.map(function (n) {
      return {
        path: tablePath(n),
        mode: "100644",
        type: "blob",
        content: JSON.stringify(tables[n], null, 2) + "\n"
      };
    });

    var tRes = await fetch(ghBase() + "/git/trees", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ base_tree: baseTree, tree: treeItems })
    });
    if (!tRes.ok) throw new Error(await errMsg(tRes, "Creazione tree fallita"));
    var newTree = (await tRes.json()).sha;

    // ponytail: niente commit vuoto → evita 422 inutili
    if (newTree === baseTree) return baseSha;

    var commitRes = await fetch(ghBase() + "/git/commits", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        message: message || "update Squadrone data",
        tree: newTree,
        parents: [baseSha]
      })
    });
    if (!commitRes.ok) {
      throw new Error(await errMsg(commitRes, "Creazione commit fallita"));
    }
    var newCommit = (await commitRes.json()).sha;

    var patchRes = await fetch(
      ghBase() + "/git/refs/heads/" + encodeURIComponent(cfg.branch),
      {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ sha: newCommit, force: false })
      }
    );
    if (!patchRes.ok) {
      var err = new Error(await errMsg(patchRes, "Aggiornamento ref fallito"));
      err.status = patchRes.status;
      throw err;
    }
    return newCommit;
  }

  async function commit(names, message) {
    if (!cfg.pat) throw new Error("Token deploy mancante.");
    names = (names || []).filter(function (n, i, a) {
      return TABLES.indexOf(n) >= 0 && a.indexOf(n) === i;
    });
    if (!names.length) return;

    var lastErr;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        return await commitOnce(names, message);
      } catch (e) {
        lastErr = e;
        // 409/422 = tip spostato (race) → riprova con SHA fresco
        if (e.status !== 409 && e.status !== 422) throw e;
        await new Promise(function (r) {
          setTimeout(r, 200 * (attempt + 1));
        });
      }
    }
    throw lastErr;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  global.Store = {
    TABLES: TABLES,
    LS: LS,
    cfg: cfg,
    tables: tables,
    uid: uid,
    today: today,
    isLoaded: function () {
      return loaded;
    },
    hasPat: function () {
      return !!cfg.pat;
    },
    isAdmin: function () {
      return localStorage.getItem(LS.admin) === "1";
    },
    setAdmin: function (ok) {
      if (ok) localStorage.setItem(LS.admin, "1");
      else localStorage.removeItem(LS.admin);
    },
    loadAll: loadAll,
    commit: commit,
    reset: function () {
      loaded = false;
    }
  };
})(window);
