ALTER TABLE action_proposal_inputs
DROP CONSTRAINT action_proposal_inputs_value_kind_check;

ALTER TABLE action_proposal_inputs
ADD CONSTRAINT action_proposal_inputs_value_kind_check
CHECK (value_kind IN ('bool', 'decimal', 'entity', 'integer', 'quantity', 'text'));
