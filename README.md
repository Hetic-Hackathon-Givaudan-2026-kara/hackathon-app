# Hackathon App

## Notre Stack Technique

- **Front-end :** Vite avec TypeScript
- **Back-end :** Node.js avec Express et PostgreSQL (via Docker)
- **Intelligence Artificielle :** Ollama (qualification Qwen 2.5 et embeddings Nomic)

## Comment démarrer (3 étapes)

1. Clonez ce dépôt et ouvrez le dossier dans VS Code.
2. Appuyez sur `F1` et choisissez **Dev Containers: Reopen in Container**.
3. Dans le terminal intégré du Dev Container, tapez `npm run dev -w web` (le front sera sur le port 5173; l'API et PostgreSQL démarrent via Compose).

_Note : Assurez-vous que l'application Ollama tourne en arrière-plan sur votre machine physique._

## Tester SmartOrder

1. Dans VS Code, choisissez **Dev Containers: Rebuild and Reopen in Container** pour démarrer les services Compose `db` et `api`.
2. Vérifiez que `DATABASE_URL` dans `api/.env` utilise l'hôte `db` depuis les conteneurs, puis ingérez le catalogue :

   ```sh
   npm run seed:catalog
   ```

   Le script ingère les deux sources si elles existent : `data/raw_catalog.csv` (fragrances) et `data/raw_catalog.json` (arômes). Laissez Ollama disponible pendant toute l'ingestion pour générer des embeddings valides; les anciennes lignes avec un embedding nul seront réindexées.
   Depuis le Dev Container, vérifiez l'API avec `curl -sS http://api:3000/api/health`. Le nom `api` n'est résolu que sur le réseau Compose; depuis l'hôte, utilisez `http://localhost:3000/api/health`.

3. Lancez le client Vite dans le terminal du Dev Container :

   ```sh
   npm run dev -w web
   ```

   Ouvrez `http://localhost:5173`. Le proxy utilise `http://api:3000` dans Compose. Pour utiliser l'API du même conteneur que Vite, définissez `API_PROXY_TARGET=http://localhost:3000`.

4. Pour la recherche sémantique, Ollama doit être joignable depuis le conteneur API. Compose utilise `http://host.docker.internal:11434` par défaut; configurez Ollama sur l'hôte pour accepter les connexions depuis le conteneur, en limitant l'accès réseau à votre environnement de développement. Téléchargez les modèles requis là où Ollama tourne :

   ```sh
   ollama pull qwen2.5:1.5b-instruct-q4_K_M
   ollama pull nomic-embed-text
   npm run test:search -- "vanille crémeuse pour boisson"
   ```

5. Vérifiez le build et la qualité :

   ```sh
   npm run build
   npm run lint
   npm run format:check
   ```
