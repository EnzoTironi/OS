ALTER TABLE action_proposals
ADD COLUMN proposed_channel_subject TEXT;

ALTER TABLE action_operations
ADD COLUMN committed_channel_subject TEXT;
