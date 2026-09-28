#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$project_root/docker-compose.science.yml"
action="${1:-up}"
science_port="${SCIENTIFIC_POSTGRES_PORT:-35432}"
science_db="${SCIENTIFIC_POSTGRES_DB:-aiacceleratedrug_science}"
science_user="${SCIENTIFIC_POSTGRES_USER:-drug_app}"
science_password="${SCIENTIFIC_POSTGRES_PASSWORD:-local-science-password}"
science_url="postgresql://${science_user}:${science_password}@127.0.0.1:${science_port}/${science_db}"

case "$action" in
  up)
    docker compose -f "$compose_file" up -d --build
    for _ in {1..60}; do
      if docker compose -f "$compose_file" exec -T scientific-postgres pg_isready -U "$science_user" -d "$science_db" >/dev/null 2>&1; then break; fi
      sleep 1
    done
    docker compose -f "$compose_file" exec -T scientific-postgres pg_isready -U "$science_user" -d "$science_db" >/dev/null
    DATABASE_URL="$science_url" "$project_root/scripts/migrate.sh"
    echo "Scientific PostgreSQL is ready on 127.0.0.1:${science_port}."
    echo "Set DATABASE_URL to the local scientific database URL before starting the app against it."
    ;;
  status)
    docker compose -f "$compose_file" ps
    PGPASSWORD="$science_password" psql -h 127.0.0.1 -p "$science_port" -U "$science_user" -d "$science_db" -Atc \
      "select extname||' '||extversion from pg_extension where extname in ('rdkit','vector') order by extname"
    ;;
  down)
    docker compose -f "$compose_file" down
    ;;
  *)
    echo "Usage: $0 {up|status|down}" >&2
    exit 2
    ;;
esac
