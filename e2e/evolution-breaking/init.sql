CREATE ROLE zoen_app
    LOGIN
    PASSWORD 'zoen_app'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT;

CREATE ROLE zoen_projection
    LOGIN
    PASSWORD 'zoen_projection'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION
    NOBYPASSRLS;

DO $$
DECLARE
    database_name text;
BEGIN
    FOR database_name IN
        SELECT datname FROM pg_catalog.pg_database WHERE datallowconn
    LOOP
        EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON DATABASE %I FROM PUBLIC',
            database_name
        );
    END LOOP;
END
$$;
GRANT CONNECT ON DATABASE zoen TO zoen_app, zoen_projection;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO zoen_app;
GRANT USAGE ON SCHEMA public TO zoen_projection;
