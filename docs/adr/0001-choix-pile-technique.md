# 0001. Structurer la pile technique en monolithe containerisé (Express, Vite, PostgreSQL, Ollama/Mistral)

- Statut : acceptée
- Date : 2026-11-09
- Décideurs : Imame Kara, Chris Mlyem Bell, Harry Gozo, Bienvenu Makedika, Rayan Founsie (Équipe n° 09 - Witchers)

## Contexte

Dans le cadre du Challenge AI Givaudan (Problématique 02 - Plateforme de commande intelligente), l'équipe doit livrer en 2 semaines un MVP permettant à un client B2B (ex: Julien, chef de projet PME boissons) de commander des arômes en langage naturel sans connaître le catalogue technique.

Le catalogue officiel SAP/R&D de Givaudan étant inaccessible pour des raisons de confidentialité, l'équipe Data doit exploiter des données synthétiques issues d'Open Data (FEMA GRAS, FlavorDB2, Kaggle). L'application doit permettre la consultation simultanée de ces données et l'interaction avec un LLM, sur des postes de travail multi-OS (Windows/WSL2, macOS, Linux).

## Options

1. **Monolithe containerisé (Dev Container + Express + Vite + PostgreSQL 17 + Ollama/Mistral) :**
   - _Avantages :_ Environnement 100 % reproductible sur toutes les machines de l'équipe, intégration native de PostgreSQL 17 pour persister le catalogue Open Data et l'historique, proxy Vite évitant les blocages CORS, stack facilement exécutable via `npm run dev`.
   - _Inconvénients :_ Nécessite Docker actif et consomme des ressources mémoire en local.

2. **Microservices sur dépôts séparés (API Node, Service IA Python/FastAPI, Front React) :**
   - _Avantages :_ Isolation stricte des responsabilités entre les membres Data (Python) et Tech (Node/TS).
   - _Inconvénients :_ Complexité de déploiement, gestion réseau/CORS lourde et perte de temps critique sur un sprint de 2 semaines.

3. **Base de données SQLite locale sans conteneurisation :**
   - _Avantages :_ Aucun service de base de données à orchestrer via Docker Compose.
   - _Inconvénients :_ Problèmes de verrous lors des accès concurrents simultanés entre l'API Express et les scripts d'ingestion Data/RAG.

## Décision

Nous choisissons l'option 1 (Monolithe containerisé avec Dev Container, Express, Vite, PostgreSQL 17 et Ollama/Mistral). Ce choix garantit un environnement de développement sans friction entre les profils Product, Data et Tech, tout en offrant une base de données robuste accessible simultanément par l'API et le moteur RAG.

## Conséquences

- **Positives :**
  - Parité stricte entre les postes de développement et l'environnement de démo.
  - Exécution simplifiée via une commande unique (`npm run dev`).
  - Capacité d'évoluer vers `pgvector` sur PostgreSQL si le moteur RAG l'exige.
- **Négatives, à accepter :**
  - Obligation pour chaque développeur de lancer Docker Desktop / Engine au préalable.
  - Utilisation de données catalogues fictives (FEMA GRAS) au lieu des vraies références Givaudan.
- **À revoir si :**
  - Le volume de données du catalogue synthétique ou la complexité des embeddings nécessite une base vectorielle dédiée (ex: Qdrant, ChromaDB).
