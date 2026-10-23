// node test/notify.test.mjs — chi riceve quale notifica push a ogni cambio di absences.
import assert from "node:assert/strict";
import { notifiche, payload } from "../push/notify.mjs";

const people = [
  { id: "mubqvhx6r8lx4o", nome: "Mario", cognome: "Cmd", admin: true },
  { id: "capo", nome: "Ugo", cognome: "Capo", admin: true, capo: "officina" },
  { id: "cte", nome: "Ada", cognome: "Cte", fn: "cte" },
  { id: "aiut", nome: "Eva", cognome: "Aiut", fn: "aiutante" },
  { id: "u1", nome: "Luca", cognome: "Rossi", gruppo: "officina" }
];
const L = { id: "a1", personId: "u1", by: "u1", tipo: "licenza", sub: "ordinaria", dal: "2026-11-02", al: "2026-11-04", gruppo: "officina" };
const who = (b, a) => Object.fromEntries([...notifiche(b, a, people)].map(([k, l]) => [k, l.map((m) => m.t)]));

// inserita dall'utente: comandante e capo del gruppo
assert.deepEqual(who([], [L]), { mubqvhx6r8lx4o: ["Da approvare"], capo: ["Da approvare"] });
// parere del capo: nessuna novità
assert.deepEqual(who([L], [{ ...L, capo: "si" }]), {});
// comandante accetta la licenza: Cte da approvare, Aiutante da registrare, utente informato
assert.deepEqual(who([L], [{ ...L, cmd: "si" }]), { cte: ["Da approvare"], aiut: ["Licenza da registrare"], u1: ["Approvata dal comandante, ora al Cte di Gruppo"] });
// Cte accetta: solo l'utente (l'Aiutante l'aveva già); registrata: niente
const ok = { ...L, cmd: "si", cte: "si" };
assert.deepEqual(who([{ ...L, cmd: "si" }], [ok]), { u1: ["Richiesta accettata"] });
assert.deepEqual(who([ok], [{ ...ok, fatta: true }]), {});
// rifiuto del comandante
assert.deepEqual(who([L], [{ ...L, cmd: "no" }]), { u1: ["Richiesta rifiutata"] });
// assegnata dal comandante (cmd "si" automatico): non è una licenza → solo l'interessato
const G = { id: "g1", personId: "u1", by: "mubqvhx6r8lx4o", tipo: "guardia", dal: "2026-11-05", al: "2026-11-05", cmd: "si" };
assert.deepEqual(who([], [G]), { u1: ["Nuovo impegno"] });
// licenza propria del comandante: al Cte, non a sé stesso
assert.deepEqual(who([], [{ ...L, id: "a2", personId: "mubqvhx6r8lx4o", by: "mubqvhx6r8lx4o", cmd: "si", gruppo: undefined }]), { cte: ["Da approvare"], aiut: ["Licenza da registrare"] });
// guardia dell'utente + RCO automatico (senza gruppo): la guardia a comandante e capo, l'RCO solo al comandante
const G2 = { id: "g2", personId: "u1", by: "u1", tipo: "guardia", dal: "2026-11-05", al: "2026-11-05", gruppo: "officina" };
assert.deepEqual(who([], [G2, { id: "r2", personId: "u1", by: "u1", tipo: "rco", dal: "2026-11-06", al: "2026-11-06", rif: "g2" }]),
  { mubqvhx6r8lx4o: ["Da approvare", "Da approvare"], capo: ["Da approvare"] });
// più novità per una persona → una notifica sola
assert.equal(payload([{ t: "A", b: "x" }, { t: "B", b: "y" }]).title, "2 novità");
assert.equal(notifiche([], [L], people).get("capo")[0].b, "Rossi Luca · Licenza ordinaria 02/11–04/11");
console.log("notify ok");
