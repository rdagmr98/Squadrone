# Squadrone

Registro presenza/assenze per lo squadrone (personale AMI).

## Architettura (come SIEL / AVES / corsi)

- **Frontend** (questo repo): HTML/JS statico su **GitHub Pages**
- **Backend dati**: repo separato [`squadrone-data`](https://github.com/rdagmr98/squadrone-data) — JSON via GitHub Contents / Git Data API

## Flussi

1. **Personale** — registrazione nome+cognome; segna presente oppure assenza (licenze, guardia, polveriera, 72° stormo, ritardi, altro/note).
2. **Comandante** — PIN admin (default `0000` in `js/config.js`); dashboard presenti/assenti + motivo.

## Setup PAT

Come SIEL/AVES:

1. Crea un Fine-Grained PAT con **Contents: Read and write** solo su `squadrone-data`.
2. Opzione A — secret Actions `SQUADRONE_PAT` su questo repo (iniettato in `config.js` al deploy, come `READ_PAT` su corsi).
3. Opzione B — Impostazioni (ingranaggio) nell'app: il token resta in `localStorage`.

## Deploy

Ogni push su `main` pubblica su GitHub Pages (workflow come SIEL).

Pages URL tipica: `https://rdagmr98.github.io/Squadrone/`
