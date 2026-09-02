#!/bin/sh
set -eu
if [ -z "${ZOEN_APP_PASSWORD:-}" ]; then
  echo "001-roles: ZOEN_APP_PASSWORD is required" >&2
  exit 1
fi
if [ -z "${ZOEN_PROJECTION_PASSWORD:-}" ]; then
  echo "001-roles: ZOEN_PROJECTION_PASSWORD is required" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 \
  --set=zoen_database="$POSTGRES_DB" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
\getenv zoen_app_password ZOEN_APP_PASSWORD
\getenv zoen_projection_password ZOEN_PROJECTION_PASSWORD
CREATE ROLE zoen_app
    LOGIN
    PASSWORD :'zoen_app_password'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT;

CREATE ROLE zoen_projection
    LOGIN
    PASSWORD :'zoen_projection_password'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION
    NOBYPASSRLS;

SELECT 'CREATE DATABASE zoen_auth OWNER zoen_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zoen_auth')\gexec
SELECT pg_catalog.format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM PUBLIC', datname)
FROM pg_catalog.pg_database
WHERE datallowconn\gexec
GRANT CONNECT ON DATABASE :"zoen_database" TO zoen_app, zoen_projection;
GRANT CONNECT ON DATABASE zoen_auth TO zoen_app;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO zoen_app;
GRANT USAGE ON SCHEMA public TO zoen_projection;
SQL
