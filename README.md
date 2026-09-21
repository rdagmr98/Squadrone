# Squadrone

Registro presenza/assenze per lo squadrone (personale AMI).

## Architettura (come corsi SMAM / AVES)

- **Frontend** (questo repo): HTML/JS su **GitHub Pages**
- **Backend dati**: [`squadrone-data`](https://github.com/rdagmr98/squadrone-data) — JSON via GitHub API
- **PAT**: secret Actions `READ_PAT` iniettato in `config.js` al deploy (come `--dart-define=READ_PAT` su corsi). Gli utenti **non** inseriscono token.

## Flussi

1. **Personale** — registrazione nome+cognome; presente oppure assenza: licenze, guardia, polveriera, 72° stormo, Hangar 7, ritardi, altro/note.
2. **Comandante** — PIN admin (default `1234` in `squadrone-data/config.json`); dashboard presenti/assenti + motivo.

## Setup (una tantum, come corsi)

1. Fine-Grained PAT con **Contents: Read and write** su `squadrone-data`.
2. Repo Squadrone → Settings → Secrets → Actions → `READ_PAT`.
3. Push su `main` → Actions pubblica Pages.

URL: `https://rdagmr98.github.io/Squadrone/`
