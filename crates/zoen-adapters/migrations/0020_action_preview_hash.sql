-- Kernel preview_hash binding for Action proposals.
-- SHA-256 hex of RFC 8785 JCS(ActionPreviewDocument).

ALTER TABLE action_proposals
    ADD COLUMN preview_hash CHAR(64) NOT NULL
        CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
    ADD COLUMN canonical_preview_text TEXT NOT NULL;
