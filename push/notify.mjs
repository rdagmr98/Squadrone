// Invio Web Push: lo esegue l'Action .github/workflows/push.yml di squadrone-data a ogni commit su db/absences.json.
// Confronta absences prima/dopo il commit e notifica chi deve agire o chi è coinvolto.
// Uso: node push/notify.mjs <cartella checkout squadrone-data>   (env VAPID_PUBLIC, VAPID_PRIVATE)
// Sta qui e non nel repo dati: il PAT pubblico del sito scrive su squadrone-data e non deve poter cambiare codice che vede i secret.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// ponytail: regole copiate da js/app.js (TIPI, LIC, isCmd, capoDi, stato, stText, pend, licOk): se cambiano lì, aggiornare qui
const CMD = "mubqvhx6r8lx4o";
const TIPI = { licenza: "Licenza", guardia: "Guardia", polveriera: "Polveriera", stormo72: "72° Stormo", orario: "Assenza oraria", altro: "Altro" };
const LIC = { ordinaria: "Licenza ordinaria", straordinaria: "Licenza straordinaria", festivita: "Recupero festività", l937: "Riposo L. 937/77",
  compensativo: "Recupero compensativo", l104: "Permesso L. 104/92", riposo: "Riposo medico", convalescenza: "Licenza di convalescenza", altra: "Altro" };
const GRUPPI = { officina: 1, tecnica: 1 };

const isCmd = (p) => p.id === CMD;
const capoDi = (p) => (p.admin && GRUPPI[p.capo] ? p.capo : null);
const stato = (a) => (a.tipo === "licenza" && a.cmd === "si" ? a.cte || "attesa" : a.cmd || "attesa");
const daCte = (a) => a.tipo === "licenza" && a.cmd === "si" && !a.cte;
const pendFor = (p, a) => (!a.cmd && (isCmd(p) || (a.gruppo && !a.capo && a.gruppo === capoDi(p)))) || (p.fn === "cte" && daCte(a));
const licOk = (a) => a.tipo === "licenza" && a.cte === "si" && !a.fatta;
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const what = (a) => `${LIC[a.sub] || TIPI[a.tipo] || "Altro"} ${a.dal === a.al ? dm(a.dal) : `${dm(a.dal)}–${dm(a.al)}`}${a.dalle ? ` ${a.dalle}–${a.alle}` : ""}`;
const esito = (a) => (stato(a) === "si" ? "Richiesta accettata" : stato(a) === "no" ? "Richiesta rifiutata" : a.cmd === "si" ? "Approvata dal comandante, ora al Cte di Gruppo" : "");

// → Map personId → [{ t, b }]
export function notifiche(before, after, people) {
  const byId = new Map(people.map((p) => [p.id, p])), prev = new Map(before.map((a) => [a.id, a]));
  const name = (id) => { const p = byId.get(id); return p ? `${p.cognome} ${p.nome}` : "?"; };
  const out = new Map(), add = (id, t, b) => out.set(id, [...(out.get(id) || []), { t, b }]);
  for (const a of after) {
    if (!byId.has(a.personId)) continue;
    const b = prev.get(a.id), chi = `${name(a.personId)} · ${what(a)}`;
    for (const p of people) {
      if (p.id !== a.by && pendFor(p, a) && !(b && pendFor(p, b))) add(p.id, "Da approvare", chi);
      if (p.fn === "aiutante" && licOk(a) && !(b && licOk(b))) add(p.id, "Licenza da registrare", chi);
    }
    if (b && esito(a) && esito(a) !== esito(b)) add(a.personId, esito(a), what(a));
    if (!b && a.by && a.by !== a.personId) add(a.personId, "Nuovo impegno", `${what(a)} (da ${name(a.by)})`);
  }
  return out;
}

export const payload = (l) => (l.length === 1 ? { title: l[0].t, body: l[0].b }
  : { title: `${l.length} novità`, body: l.map((m) => `${m.t}: ${m.b}`).join("\n") });

async function main(dir) {
  const show = (rev, f) => { try { return JSON.parse(execFileSync("git", ["-C", dir, "show", `${rev}:${f}`], { maxBuffer: 1 << 28 })); } catch { return []; } };
  // ponytail: HEAD~1 = commit precedente; ogni scrittura del sito (Contents API) è un push con un solo commit
  const people = show("HEAD", "db/personnel.json"), out = notifiche(show("HEAD~1", "db/absences.json"), show("HEAD", "db/absences.json"), people);
  const { default: wp } = await import("web-push");
  wp.setVapidDetails("https://rdagmr98.github.io/Squadrone/", process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
  const jobs = [...out].flatMap(([id, l]) => (people.find((p) => p.id === id)?.push || []).map((s) =>
    wp.sendNotification(s, JSON.stringify(payload(l)), { TTL: 86400, urgency: "high" })));
  const r = await Promise.allSettled(jobs);
  // solo conteggi nel log: niente nomi né endpoint
  console.log(`destinatari ${out.size}, invii ${r.filter((x) => x.status === "fulfilled").length}/${r.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv[2] || ".");
