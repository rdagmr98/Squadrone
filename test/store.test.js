// node test/store.test.js — due scritture concorrenti non si sovrascrivono.
const fs = require("fs"), vm = require("vm"), assert = require("assert");

const repo = { "absences": { sha: "0", text: "[]" } };
let n = 0;
async function fetch(url, o = {}) {
  const name = url.match(/db\/(\w+)\.json/)[1], f = repo[name];
  const res = (status, body) => ({ status, ok: status < 300, json: async () => body });
  if (!o.method) return f ? res(200, { sha: f.sha, content: Buffer.from(f.text).toString("base64") }) : res(404, {});
  const b = JSON.parse(o.body);
  if (f && b.sha !== f.sha) return res(409, { message: "sha mismatch" });
  repo[name] = { sha: String(++n), text: Buffer.from(b.content, "base64").toString() };
  return res(200, {});
}

const ctx = { fetch, atob, btoa, TextEncoder, TextDecoder, setTimeout, SQUADRONE_CONFIG: { pat: "x" } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../js/store.js", "utf8"), ctx);

(async () => {
  await Promise.all(["a", "b", "c"].map((id) => ctx.Store.mutate("absences", (l) => l.push({ id, note: "è" }))));
  const saved = JSON.parse(repo.absences.text);
  assert.deepStrictEqual(saved.map((x) => x.id).sort(), ["a", "b", "c"]);
  assert.strictEqual(saved[0].note, "è");
  await ctx.Store.mutate("personnel", (l) => l.push({ id: "p" })); // file assente → creato
  assert.strictEqual(JSON.parse(repo.personnel.text)[0].id, "p");
  console.log("ok");
})().catch((e) => { console.error(e); process.exit(1); });
