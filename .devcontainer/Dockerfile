# Même base que l'image de production : Node 24 sur Debian trixie
FROM mcr.microsoft.com/devcontainers/typescript-node:24-trixie

# Client PostgreSQL (psql 17, comme le serveur)
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*