-- Eve owns conversation and channel-ingress durability. Ontology retains no
-- parallel conversation, delivery, or webhook replay state.

DROP TABLE IF EXISTS
    interaction_records,
    conversation_pending,
    conversation_turns,
    turn_attempts,
    conversation_arms,
    delivery_intents,
    delivery_observations,
    delivery_send_claims,
    reply_ledger,
    ingress_replay;
