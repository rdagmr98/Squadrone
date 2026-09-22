# Squadrone Mantenimento · H7

Presenze/assenze dello squadrone, mobile-first. HTML/JS vanilla, nessuna build.

## Architettura (come corsi SMAM / AVES)

- **Frontend** (questo repo): GitHub Pages via `.github/workflows/pages.yml`
- **Dati**: [`squadrone-data`](https://github.com/rdagmr98/squadrone-data) → `db/personnel.json`, `db/absences.json` (GitHub Contents API)
- **Scritture**: `Store.mutate` rilegge + riapplica su conflitto (409/422) → nessun salvataggio perso con più utenti insieme
- **PAT**: secret Actions `SQUADRONE_PAT` (fallback `READ_PAT`) iniettato in `js/config.js` al deploy, insieme a `cmd` (id del comandante)

## Flussi

1. **Personale** — registrazione/login con nome, cognome e password (qualsiasi, hash PBKDF2). Impegni: licenza, guardia, polveriera, 72° Stormo, assenza oraria (dalle/alle, stesso giorno), altro (nota). Ogni utente sceglie il gruppo: Officina o Sezione Tecnica.
2. **Comandante** — unico, identificato da `cmd` in config (niente PIN). Promuove admin (senza gruppo) e sceglie tra loro Capo Officina e Capo Sezione Tecnica. Assegna impegni a tutti / ad alcuni / a uno; reset password, elimina.
3. **Approvazioni** — impegno di un utente → campanella del capo del suo gruppo e del comandante (che vede il parere del capo e decide). Impegni inseriti da admin/capi → solo comandante. Rifiutati = non contano come assenza.
4. **Oggi** — presenti/assenti/assenze orarie per giorno, filtro Tutti / Officina / Sez. Tecnica.

## Setup (una tantum)

1. Fine-Grained PAT con **Contents: Read and write** su `squadrone-data`.
2. Repo Squadrone → Settings → Secrets → Actions → `SQUADRONE_PAT`.
3. Push su `main` → Actions pubblica Pages.

Test: `node test/store.test.js`

URL: `https://rdagmr98.github.io/Squadrone/`
