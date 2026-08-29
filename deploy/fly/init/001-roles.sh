#!/bin/sh
set -eu
if [ -z "${ZOEN_APP_PASSWORD:-}" ]; then
  echo "001-roles: ZOEN_APP_PASSWORD is required" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE zoen_app
    LOGIN
    PASSWORD '${ZOEN_APP_PASSWORD}'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO zoen_app;
GRANT ALL ON SCHEMA public TO zoen_app;
SELECT 'CREATE DATABASE zoen_auth OWNER zoen_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zoen_auth')\gexec
SQL
