# AGENTS.md — Instructions pour l'Assistant IA (GitHub Copilot)

Plateforme de commande intelligente B2B Givaudan (Problématique 02 - Équipe 09 Witchers).
Monolithe containerisé : API Express (TypeScript), Front Vite (TypeScript), PostgreSQL 17 (Open Data FEMA GRAS/FlavorDB2) et moteur IA local Ollama/Mistral. Présentation du projet : `README.md`.

## Lancer

Toutes les commandes s'exécutent exclusivement à l'intérieur du Dev Container.

- `npm run dev` : Lance l'API Express (port 3000) et le Front-end Vite (port 5173).
- `curl -s localhost:3000/api/health` : Vérification du statut de l'API (doit répondre `{"status":"ok"}`).
- Avant d'annoncer une tâche terminée : Exécuter `npm run lint`, `npm run format:check` et `npm run build`. Ce sont les contrôles stricts de la CI `qualite`.

## Règles

- **Routes API & Proxy :** Les routes back-end sont localisées dans `api/src/index.ts`. Le front interroge `/api` via le proxy configuré dans `web/vite.config.ts`.
- **Base de données & Seeds :** Le schéma SQL et le script d'initialisation du catalogue Open Data (FEMA GRAS / FlavorDB2) sont dans `db/init/`. Ils ne s'exécutent qu'au premier démarrage du conteneur Docker.
- **Intégration IA & RAG :** Le module LLM/RAG passe par la fonction `ask()` dans `api/src/index.ts`. Les configurations et endpoints IA résident dans `api/.env`, jamais dans le code source.
- **Branches & Pull Requests :** Une branche dédiée par tâche issue de `develop` (`feature/nom-court`). Toute PR vise `develop`, contient le mot-clé `Closes #N` et respecte `.github/PULL_REQUEST_TEMPLATE.md`.
- **Tâches & Brouillons :** Le plan de travail officiel vit dans l'issue GitHub correspondante (`gh issue view N`). Les brouillons de session et notes temporaires vont dans `.scratch/` (ignoré par Git).

## Décisions

- Consulter systématiquement `docs/adr/` (notamment `docs/adr/0001-choix-pile-technique.md`) avant d'ajouter une dépendance ou de modifier un composant d'infrastructure.
- Ne jamais contredire un ADR au statut « acceptée » (Monolithe Dev Container, Express, Vite, PostgreSQL 17, Ollama/Mistral).
- Si une modification d'architecture est nécessaire, proposer un nouvel ADR au statut `proposée` dans `docs/adr/` et interrompre l'exécution.

## À ne pas faire

- Passer `--no-verify` lors d'un `git commit` ou ajouter des commentaires `eslint-disable` pour forcer le passage d'un contrôle de linter.
- Exécuter `npm install` en dehors du Dev Container : le fichier `package-lock.json` doit impérativement rester aligné avec l'environnement Linux du conteneur.
- Inscrire des clés d'API, mots de passe ou secrets en dur dans le code source (utiliser exclusivement `api/.env`).
- Proposer SQLite, une architecture microservices ou une autre BDD en contradiction avec l'ADR 0001.
