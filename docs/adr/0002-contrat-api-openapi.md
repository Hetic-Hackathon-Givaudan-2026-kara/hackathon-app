# 0002. Adopter la spécification OpenAPI pour formaliser le contrat d'interface API

- Statut : acceptée
- Date : 2026-11-10
- Décideurs : Imame Kara, équipe Tech-Leads

## Contexte

La plateforme de commande intelligente nécessite un contrat d'interface clair entre le Front-end (Vite/TS), l'API Core (Express/TS) et le moteur de recherche IA/Data. Sans spécification formelle, le risque d'incohérence sur le format des requêtes de recherche et des objets JSON retournés est élevé.

## Options

1. **Documentation manuelle dans un fichier Markdown (`docs/api.md`) :**
   - _Avantages :_ Simple à rédiger.
   - _Inconvénients :_ Pas de validation automatique, risque de désynchronisation rapide avec le code.

2. **Formalisation via une spécification OpenAPI 3.0 (`openapi.yaml`) :**
   - _Avantages :_ Standard de l'industrie, lisible par les humains et les LLMs, permet la génération automatique de types TypeScript et de tests de contrat. Cité directement par les consignes du projet dans le fichier `openapi.yaml`.
   - _Inconvénients :_ Exige une maintenance stricte lors de l'ajout de nouveaux endpoints.

## Décision

Nous choisissons l'option 2 et adoptons la spécification OpenAPI 3.0 matérialisée par le fichier `openapi.yaml` situé à la racine du dépôt. L'API Express et le Front-end doivent strictement se conformer aux Schémas définis dans `openapi.yaml`.

## Conséquences

- **Positives :**
  - Contrat d'interface unique et indiscutable entre l'équipe Front, Back et Data.
  - Possibilité de valider automatiquement la conformité des réponses JSON via la CI.
  - L'assistant IA Copilot s'appuie sur `openapi.yaml` pour générer les routes API.
- **Négatives, à accepter :**
  - Tout changement de signature d'endpoint impose la mise à jour préalable du fichier `openapi.yaml`.
- **À revoir si :**
  - L'architecture évolue vers des schémas GraphQL ou gRPC pour des besoins de streaming de réponses.
