# Squadrone Mantenimento · H7

Presenze/assenze dello squadrone, mobile-first. HTML/JS vanilla, nessuna build.

## Architettura (come corsi SMAM / AVES)

- **Frontend** (questo repo): GitHub Pages via `.github/workflows/pages.yml`
- **Dati**: [`squadrone-data`](https://github.com/rdagmr98/squadrone-data) → `db/personnel.json`, `db/absences.json` (GitHub Contents API)
- **Scritture**: `Store.mutate` rilegge + riapplica su conflitto (409/422) → nessun salvataggio perso con più utenti insieme
- **PAT**: secret Actions `SQUADRONE_PAT` (fallback `READ_PAT`) iniettato in `js/config.js` al deploy, insieme a `adminPin`

## Flussi

1. **Personale** — registrazione/login con nome, cognome e password (qualsiasi, hash PBKDF2). Impegni: licenza, guardia, polveriera, 72° Stormo, ritardo, altro (nota).
2. **Comandante** — Profilo → PIN comando → admin. Vista Oggi: presenti/assenti, motivi, giorno per giorno. Assegna impegni a tutti / ad alcuni / a uno; reset password, admin, elimina.

## Setup (una tantum)

1. Fine-Grained PAT con **Contents: Read and write** su `squadrone-data`.
2. Repo Squadrone → Settings → Secrets → Actions → `SQUADRONE_PAT`.
3. Push su `main` → Actions pubblica Pages.

Test: `node test/store.test.js`

URL: `https://rdagmr98.github.io/Squadrone/`
