# AGENTS.md — Instructions IA (GitHub Copilot)

Monolithe Dev Container : Express (TS), Vite (TS), PostgreSQL 17, Ollama/Mistral.

## Lancer

- `npm run dev` (API: 3000, Front: 5173). Health: `curl -s localhost:3000/api/health`.
- Contrôles CI : `npm run lint`, `npm run format:check`, `npm run build`.

## Règles

- Back : `api/src/index.ts`. Proxy front : `web/vite.config.ts`. BDD : `db/init/`.
- Branches depuis `develop` (`feature/nom-court`). PR avec `Closes #N`.
- Brouillons dans `.scratch/` (ignoré). Secrets dans `api/.env`.

## Décisions & Interdictions

- Consulter et respecter `docs/adr/` (PostgreSQL 17, Ollama, Monolithe).
- Interdit : `--no-verify`, `eslint-disable`, `npm install` hors conteneur, clés en dur.
