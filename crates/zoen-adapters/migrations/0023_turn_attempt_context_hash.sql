-- Persist only the conversation context digest on TurnAttempt.
-- The sealed document is rebuilt from interaction/world/history refs.

ALTER TABLE turn_attempts
    ADD COLUMN context_hash CHAR(64);
