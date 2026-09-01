use zoen_core::{ActionId, ActionProposal, ExactValue};

pub const REMINDER_DELIVERY_SCHEMA_VERSION: u32 = 1;
pub const REMINDER_DELIVERY_EXECUTOR_CLASS: &str = "reminder_delivery";
const REMINDER_ACTION: &str = "personal.createReminder";
const REMINDER_DUE_RELATION: &str = "personal.dueAt";

#[must_use]
pub fn is_reminder_delivery_action(action_id: &ActionId) -> bool {
    action_id.as_str() == REMINDER_ACTION
}

/// True only on the effect whose relation is `personal.dueAt` — one delivery per
/// commit, never one per declared effect.
#[must_use]
pub fn is_reminder_due_relation(relation_id: &str) -> bool {
    relation_id == REMINDER_DUE_RELATION
}

/// Mint the reminder delivery contract from an Action proposal.
///
/// Returns `None` when the `body`/`dueAt` text inputs are absent or the
/// committing context carries no `WhatsApp` channel subject; the caller falls
/// back to the normal projection-event payload and the worker ignores the
/// effect. The delivery destination (`to`, the waId) derives from the channel
/// subject threaded into the proposal by the session layer: provider-native
/// senders are `ExternalSubject`s and can never appear as a `PrincipalId`
/// (see `crates/zoen-core/src/identity.rs`), so the subject rides the
/// committing context instead. Door- and workload-authenticated commits carry
/// no channel subject, which keeps the mint inert outside `WhatsApp` turns.
///
/// # Errors
///
/// Returns `String` when the contract fails to encode as JSON.
pub fn mint_reminder_delivery_payload(
    proposal: &ActionProposal,
) -> Result<Option<Vec<u8>>, String> {
    let text_input = |id: &str| -> Option<String> {
        proposal
            .inputs
            .iter()
            .find(|input| input.id.as_str() == id)
            .and_then(|input| match &input.value {
                ExactValue::Text(text) if !text.is_empty() => Some(text.clone()),
                _ => None,
            })
    };
    let (Some(body), Some(due_at)) = (text_input("body"), text_input("dueAt")) else {
        return Ok(None);
    };
    let Some(to) = proposal
        .proposed_by
        .channel_subject()
        .and_then(zoen_core::ExternalSubject::whatsapp_wa_id)
    else {
        return Ok(None);
    };
    serde_json::to_vec(&serde_json::json!({
        "schemaVersion": REMINDER_DELIVERY_SCHEMA_VERSION,
        "executorClass": REMINDER_DELIVERY_EXECUTOR_CLASS,
        "body": body,
        "dueAt": due_at,
        "channel": { "kind": "whatsapp", "to": to },
    }))
    .map(Some)
    .map_err(|error| error.to_string())
}
