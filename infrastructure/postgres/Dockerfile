FROM postgres:16-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-rdkit postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*

COPY init/001_extensions.sql /docker-entrypoint-initdb.d/001_extensions.sql
