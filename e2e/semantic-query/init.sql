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
    NOBYPASSRLS;

GRANT CONNECT ON DATABASE zoen TO zoen_app, zoen_projection;
GRANT ALL ON SCHEMA public TO zoen_app;
GRANT USAGE ON SCHEMA public TO zoen_projection;
