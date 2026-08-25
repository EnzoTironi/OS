-- Kernel preview_hash binding for Action proposals.
-- SHA-256 hex of RFC 8785 JCS(ActionPreviewDocument).
-- Existing rows get a zero digest and empty text. Commit recomputes from
-- stored fields and rejects that placeholder.

ALTER TABLE action_proposals
    ADD COLUMN preview_hash CHAR(64),
    ADD COLUMN canonical_preview_text TEXT;

UPDATE action_proposals
SET
    preview_hash = '0000000000000000000000000000000000000000000000000000000000000000',
    canonical_preview_text = ''
WHERE preview_hash IS NULL OR canonical_preview_text IS NULL;

ALTER TABLE action_proposals
    ALTER COLUMN preview_hash SET NOT NULL,
    ALTER COLUMN canonical_preview_text SET NOT NULL;

ALTER TABLE action_proposals
    ADD CONSTRAINT action_proposals_preview_hash_hex
    CHECK (preview_hash ~ '^[0-9a-f]{64}$');
