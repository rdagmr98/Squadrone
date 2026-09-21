/* Layer dati: JSON su repo squarone-data via GitHub Contents / Git Data API.
   Stesso pattern di SIEL (store.js) e AVES/corsi (GhDbService). */
(function (global) {
  "use strict";

  var API = "https://api.github.com";
  var LS = {
    pat: "squadrone_pat",
    owner: "squadrone_owner",
    repo: "squadrone_data_repo",
    branch: "squadrone_branch",
    admin: "squadrone_admin_ok"
  };

  var TABLES = ["personnel", "absences", "config"];
  var baked = global.SQUADRONE_CONFIG || {};

  var cfg = {
    get pat() {
      return localStorage.getItem(LS.pat) || baked.pat || "";
    },
    set pat(v) {
      if (v) localStorage.setItem(LS.pat, v);
      else localStorage.removeItem(LS.pat);
    },
    get owner() {
      return localStorage.getItem(LS.owner) || baked.owner || "rdagmr98";
    },
    set owner(v) {
      localStorage.setItem(LS.owner, v || "rdagmr98");
    },
    get repo() {
      return localStorage.getItem(LS.repo) || baked.repo || "squadrone-data";
    },
    set repo(v) {
      localStorage.setItem(LS.repo, v || "squadrone-data");
    },
    get branch() {
      return localStorage.getItem(LS.branch) || baked.branch || "main";
    },
    set branch(v) {
      localStorage.setItem(LS.branch, v || "main");
    },
    get adminPin() {
      var remote = tables.config;
      if (remote && typeof remote === "object" && !Array.isArray(remote) && remote.adminPin) {
        return String(remote.adminPin);
      }
      return baked.adminPin || "1234";
    }
  };

  var tables = { personnel: [], absences: [], config: { adminPin: "1234", title: "Squadrone" } };
  var loaded = false;

  function headers(accept) {
    return {
      Authorization: "token " + cfg.pat,
      Accept: accept || "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function ghBase() {
    return API + "/repos/" + cfg.owner + "/" + cfg.repo;
  }

  function emptyFor(name) {
    if (name === "config") return { adminPin: "1234", title: "Squadrone" };
    return [];
  }

  async function readTable(name) {
    var url =
      ghBase() +
      "/contents/" +
      name +
      ".json?ref=" +
      encodeURIComponent(cfg.branch);
    var res = await fetch(url, {
      headers: headers("application/vnd.github.raw")
    });
    if (res.status === 404) return emptyFor(name);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Token non valido o senza accesso a " +
          cfg.owner +
          "/" +
          cfg.repo +
          " (HTTP " +
          res.status +
          ")"
      );
    }
    if (!res.ok) {
      throw new Error("Lettura " + name + " fallita (HTTP " + res.status + ")");
    }
    var txt = await res.text();
    if (!txt.trim()) return emptyFor(name);
    try {
      return JSON.parse(txt);
    } catch (e) {
      throw new Error("JSON non valido in " + name + ".json");
    }
  }

  async function loadAll(force) {
    if (loaded && !force) return tables;
    if (!cfg.pat) {
      throw new Error(
        "Token mancante: apri Impostazioni e inserisci il PAT, oppure configura il secret SQUADRONE_PAT sul deploy."
      );
    }
    var results = await Promise.all(TABLES.map(readTable));
    TABLES.forEach(function (t, i) {
      tables[t] = results[i] != null ? results[i] : emptyFor(t);
    });
    loaded = true;
    return tables;
  }

  async function commit(names, message) {
    if (!cfg.pat) throw new Error("Token mancante.");
    names = (names || []).filter(function (n, i, a) {
      return a.indexOf(n) === i;
    });
    if (!names.length) return;

    var refUrl =
      ghBase() + "/git/ref/heads/" + encodeURIComponent(cfg.branch);
    var refRes = await fetch(refUrl, { headers: headers() });
    if (!refRes.ok) throw new Error("Ref non trovata (HTTP " + refRes.status + ")");
    var ref = await refRes.json();
    var baseSha = ref.object.sha;

    var cRes = await fetch(ghBase() + "/git/commits/" + baseSha, {
      headers: headers()
    });
    if (!cRes.ok) throw new Error("Commit base non trovato (HTTP " + cRes.status + ")");
    var baseCommit = await cRes.json();
    var baseTree = baseCommit.tree.sha;

    var treeItems = names.map(function (n) {
      return {
        path: n + ".json",
        mode: "100644",
        type: "blob",
        content: JSON.stringify(tables[n], null, 2)
      };
    });

    var tRes = await fetch(ghBase() + "/git/trees", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ base_tree: baseTree, tree: treeItems })
    });
    if (!tRes.ok) throw new Error("Creazione tree fallita (HTTP " + tRes.status + ")");
    var newTree = (await tRes.json()).sha;

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
      throw new Error("Creazione commit fallita (HTTP " + commitRes.status + ")");
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
      throw new Error("Aggiornamento ref fallito (HTTP " + patchRes.status + ")");
    }
    return newCommit;
  }

  function uid() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
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
