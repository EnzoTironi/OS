use zoen_core::{ActionId, ActionProposal, ExactValue};

pub const REMINDER_DELIVERY_SCHEMA_VERSION: u32 = 1;
pub const REMINDER_DELIVERY_EXECUTOR_CLASS: &str = "reminder_delivery";
const REMINDER_ACTION: &str = "personal.createReminder";
const REMINDER_DUE_RELATION: &str = "personal.dueAt";
const WHATSAPP_PRINCIPAL_SUFFIX: &str = "@s.whatsapp.net";

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
/// Returns `None` when the `body`/`dueAt` text inputs are absent or when the
/// proposing principal is not a `WhatsApp` principal (`<waId>@s.whatsapp.net`,
/// the format planted in `apps/conversation/agent/channels/kapso.ts`); the
/// caller falls back to the normal projection-event payload and the worker
/// ignores the effect.
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
                ExactValue::Text(text) => Some(text.clone()),
                _ => None,
            })
    };
    let (Some(body), Some(due_at)) = (text_input("body"), text_input("dueAt")) else {
        return Ok(None);
    };
    let principal = proposal.proposed_by.principal_id().as_str();
    let Some(wa_id) = principal.strip_suffix(WHATSAPP_PRINCIPAL_SUFFIX) else {
        return Ok(None);
    };
    serde_json::to_vec(&serde_json::json!({
        "schemaVersion": REMINDER_DELIVERY_SCHEMA_VERSION,
        "executorClass": REMINDER_DELIVERY_EXECUTOR_CLASS,
        "body": body,
        "dueAt": due_at,
        "channel": { "kind": "whatsapp", "to": wa_id },
    }))
    .map(Some)
    .map_err(|error| error.to_string())
}
