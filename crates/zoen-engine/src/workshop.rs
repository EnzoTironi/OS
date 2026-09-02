use zoen_core::{ActionId, ActionProposal, ExactValue};

pub const WORKSHOP_DEPLOY_APP_SCHEMA_VERSION: u32 = 1;
pub const WORKSHOP_DEPLOY_APP_EXECUTOR_CLASS: &str = "workshop_deploy_app";
const WORKSHOP_ACTION: &str = "workshop.deployApp";
const WORKSHOP_APP_SLUG_RELATION: &str = "workshop.appSlug";

#[must_use]
pub fn is_workshop_deploy_app_action(action_id: &ActionId) -> bool {
    action_id.as_str() == WORKSHOP_ACTION
}

/// True only on the effect whose relation is `workshop.appSlug` — one deploy per
/// commit, never one per declared effect.
#[must_use]
pub fn is_workshop_app_slug_relation(relation_id: &str) -> bool {
    relation_id == WORKSHOP_APP_SLUG_RELATION
}

/// Mint the workshop deploy contract from an Action proposal.
///
/// Returns `None` when any of the `slug`/`summary`/`filesDigest`/`membershipId`
/// text inputs is absent; the caller falls back to the normal projection-event
/// payload and the worker ignores the effect. The deploy itself reads the app
/// files from the membership disk at execution time and rejects the effect when
/// the on-disk digest no longer matches `filesDigest`
/// (`files_changed_after_commit`), so the contract only carries the values
/// pinned at commit time.
///
/// When the committing context carries a `WhatsApp` channel subject, the
/// contract includes `channel` (same derivation as
/// `reminder::mint_reminder_delivery_payload`) so the worker can deliver the
/// "tá no ar" URL to the person's chat. The deploy itself is not
/// channel-dependent, so unlike the reminder mint the contract still mints
/// without one — the worker then confirms the effect and skips the message.
///
/// # Errors
///
/// Returns `String` when the contract fails to encode as JSON.
pub fn mint_workshop_deploy_app_payload(
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
    let (Some(slug), Some(summary), Some(files_digest), Some(membership_id)) = (
        text_input("slug"),
        text_input("summary"),
        text_input("filesDigest"),
        text_input("membershipId"),
    ) else {
        return Ok(None);
    };
    let channel = proposal
        .proposed_by
        .channel_subject()
        .and_then(zoen_core::ExternalSubject::whatsapp_wa_id)
        .map(|to| serde_json::json!({ "kind": "whatsapp", "to": to }));
    let mut contract = serde_json::json!({
        "schemaVersion": WORKSHOP_DEPLOY_APP_SCHEMA_VERSION,
        "executorClass": WORKSHOP_DEPLOY_APP_EXECUTOR_CLASS,
        "slug": slug,
        "summary": summary,
        "filesDigest": files_digest,
        "membershipId": membership_id,
    });
    if let Some(channel) = channel {
        contract["channel"] = channel;
    }
    serde_json::to_vec(&contract)
        .map(Some)
        .map_err(|error| error.to_string())
}
