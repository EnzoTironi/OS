CREATE ROLE zoen_app
    LOGIN
    PASSWORD 'zoen_app'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT;

GRANT CONNECT ON DATABASE zoen TO zoen_app;
GRANT ALL ON SCHEMA public TO zoen_app;

CREATE TABLE interaction_controls (
  ref TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  proposal_ref TEXT,
  action_binding_id TEXT,
  action_ref JSONB,
  disclosure JSONB,
  assurance TEXT,
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  step_up_session_id TEXT,
  sealed_audience_kind TEXT,
  payload JSONB NOT NULL
);

CREATE TABLE interaction_step_ups (
  id TEXT PRIMARY KEY,
  control_ref TEXT NOT NULL,
  proposal_ref TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  required_principal_id TEXT NOT NULL,
  oidc_subject TEXT,
  account_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL
);

GRANT ALL ON TABLE interaction_controls TO zoen_app;
GRANT ALL ON TABLE interaction_step_ups TO zoen_app;
