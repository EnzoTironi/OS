use sha2::{Digest, Sha256};
use zoen_core::{
    ActionId, ActionInput, ActionPreviewDocument, ActionPreviewHash, ResourceId, canonicalize_json,
};

use crate::ActionError;

/// Build the kernel preview document for an Action proposal.
pub fn build_action_preview(
    action_id: &ActionId,
    resource_id: &ResourceId,
    inputs: &[ActionInput],
) -> ActionPreviewDocument {
    ActionPreviewDocument::from_action(action_id, resource_id, inputs)
}

/// SHA-256 of RFC 8785 JCS bytes of the preview document.
pub fn preview_hash(document: &ActionPreviewDocument) -> Result<ActionPreviewHash, ActionError> {
    let canonical = canonicalize_json(&document.to_json())
        .map_err(|error| ActionError::Evaluation(format!("preview JCS failed: {error}")))?;
    Ok(ActionPreviewHash::from_sha256(
        Sha256::digest(canonical.as_bytes()).into(),
    ))
}

/// Exact hash binding. Missing, invalid, or unequal hashes fail closed.
pub fn bind_preview_hash(
    stored: &ActionPreviewHash,
    presented: Option<&str>,
) -> Result<(), PreviewBindingError> {
    let Some(presented) = presented.filter(|value| !value.is_empty()) else {
        return Err(PreviewBindingError::Missing);
    };
    let presented =
        ActionPreviewHash::parse(presented).map_err(|_| PreviewBindingError::Invalid)?;
    if !stored.constant_time_eq(&presented) {
        return Err(PreviewBindingError::Mismatch);
    }
    Ok(())
}

/// Recompute the kernel preview from stored proposal fields, then bind.
///
/// A row whose stored hash or spoken text drifted from action/resource/inputs
/// fails closed even when the client repeats the stored digest.
pub fn bind_proposal_preview(
    action_id: &ActionId,
    resource_id: &ResourceId,
    inputs: &[ActionInput],
    stored_hash: &ActionPreviewHash,
    stored_text: &str,
    presented: Option<&str>,
) -> Result<(), PreviewBindingError> {
    let preview = build_action_preview(action_id, resource_id, inputs);
    if preview.canonical_preview_text != stored_text {
        return Err(PreviewBindingError::Mismatch);
    }
    let recomputed = preview_hash(&preview).map_err(|_| PreviewBindingError::Invalid)?;
    if !recomputed.constant_time_eq(stored_hash) {
        return Err(PreviewBindingError::Mismatch);
    }
    bind_preview_hash(&recomputed, presented)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PreviewBindingError {
    Invalid,
    Mismatch,
    Missing,
}

impl PreviewBindingError {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Invalid => "preview hash is not a SHA-256 hex digest",
            Self::Mismatch => "preview hash does not match the stored proposal",
            Self::Missing => "commit requires the exact preview hash",
        }
    }
}

#[cfg(test)]
mod tests {
    use zoen_core::{
        ActionId, ActionInput, ActionPreviewHash, ExactInteger, ExactValue, InputId, ResourceId,
        canonicalize_json,
    };

    use super::{
        PreviewBindingError, bind_preview_hash, bind_proposal_preview, build_action_preview,
        preview_hash,
    };

    fn quantity_two() -> ActionInput {
        ActionInput {
            id: InputId::parse("quantity").expect("input"),
            value: ExactValue::Integer(ExactInteger::parse("2").expect("integer")),
        }
    }

    fn request_stock() -> (ActionId, ResourceId) {
        (
            ActionId::parse("inventory.requestStock").expect("action"),
            ResourceId::parse("inventory.item.1").expect("resource"),
        )
    }

    #[test]
    fn preview_hash_is_sha256_of_jcs_bytes() {
        let (action, resource) = request_stock();
        let document = build_action_preview(&action, &resource, &[quantity_two()]);
        let hash = preview_hash(&document).expect("hash");
        let canonical = canonicalize_json(&document.to_json()).expect("jcs");
        let expected = {
            use sha2::{Digest, Sha256};
            zoen_core::ActionPreviewHash::from_sha256(Sha256::digest(canonical.as_bytes()).into())
        };
        assert_eq!(hash, expected);
        assert_eq!(
            document.canonical_preview_text,
            "Vou executar requestStock com quantidade 2."
        );
        assert!(!document.canonical_preview_text.contains(resource.as_str()));
    }

    #[test]
    fn preview_hash_is_stable_across_json_key_order() {
        let (action, resource) = request_stock();
        let document = build_action_preview(&action, &resource, &[quantity_two()]);
        let left = preview_hash(&document).expect("left");
        let shuffled = format!(
            "{{\"schema\":\"{}\",\"resource\":\"{}\",\"locale\":\"{}\",\"inputs\":{},\"canonical_preview_text\":\"{}\",\"action\":\"{}\"}}",
            document.schema,
            document.resource,
            document.locale,
            "[{\"value\":\"2\",\"kind\":\"integer\",\"id\":\"quantity\"}]",
            document.canonical_preview_text,
            document.action
        );
        let canonical_left = canonicalize_json(&document.to_json()).expect("left jcs");
        let canonical_right = canonicalize_json(&shuffled).expect("right jcs");
        assert_eq!(canonical_left, canonical_right);
        assert_eq!(left.as_str().len(), 64);
    }

    #[test]
    fn input_or_preview_text_change_changes_hash() {
        let (action, resource) = request_stock();
        let two = build_action_preview(&action, &resource, &[quantity_two()]);
        let three = build_action_preview(
            &action,
            &resource,
            &[ActionInput {
                id: InputId::parse("quantity").expect("input"),
                value: ExactValue::Integer(ExactInteger::parse("3").expect("integer")),
            }],
        );
        assert_ne!(
            preview_hash(&two).expect("two"),
            preview_hash(&three).expect("three")
        );
        let mut tweaked = two.clone();
        tweaked.canonical_preview_text.push('!');
        assert_ne!(
            preview_hash(&two).expect("original"),
            preview_hash(&tweaked).expect("tweaked")
        );
    }

    #[test]
    fn bind_preview_hash_rejects_missing_invalid_and_mismatch() {
        let (action, resource) = request_stock();
        let stored = preview_hash(&build_action_preview(&action, &resource, &[quantity_two()]))
            .expect("stored");
        assert_eq!(
            bind_preview_hash(&stored, None),
            Err(PreviewBindingError::Missing)
        );
        assert_eq!(
            bind_preview_hash(&stored, Some("")),
            Err(PreviewBindingError::Missing)
        );
        assert_eq!(
            bind_preview_hash(&stored, Some("not-a-hash")),
            Err(PreviewBindingError::Invalid)
        );
        let mut tampered = stored.as_str().to_owned();
        tampered.replace_range(0..1, if &tampered[0..1] == "a" { "b" } else { "a" });
        assert_eq!(
            bind_preview_hash(&stored, Some(&tampered)),
            Err(PreviewBindingError::Mismatch)
        );
        assert_eq!(bind_preview_hash(&stored, Some(stored.as_str())), Ok(()));
    }

    #[test]
    fn preview_hash_matches_published_fixtures() {
        let root =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata/action-preview");
        let (action, resource) = request_stock();
        let request_stock = build_action_preview(&action, &resource, &[quantity_two()]);
        let note = build_action_preview(
            &ActionId::parse("personal.writeMemory").expect("action"),
            &ResourceId::parse("personal.note.1").expect("resource"),
            &[ActionInput {
                id: InputId::parse("body").expect("input"),
                value: ExactValue::Text("comprar pão".to_owned()),
            }],
        );
        for (name, document) in [("request-stock", request_stock), ("write-memory", note)] {
            let canonical = canonicalize_json(&document.to_json()).expect(name);
            let expected_jcs = std::fs::read_to_string(root.join(format!("{name}.jcs")))
                .expect("jcs")
                .replace('\n', "");
            assert_eq!(canonical, expected_jcs, "{name} jcs");
            let expected_hash = std::fs::read_to_string(root.join(format!("{name}.sha256")))
                .expect("sha256")
                .trim()
                .to_owned();
            assert_eq!(
                preview_hash(&document).expect("hash").as_str(),
                expected_hash,
                "{name} hash"
            );
        }
    }

    #[test]
    fn bind_proposal_preview_rejects_stored_hash_or_text_drift() {
        let (action, resource) = request_stock();
        let inputs = [quantity_two()];
        let document = build_action_preview(&action, &resource, &inputs);
        let stored = preview_hash(&document).expect("stored");
        assert_eq!(
            bind_proposal_preview(
                &action,
                &resource,
                &inputs,
                &stored,
                &document.canonical_preview_text,
                Some(stored.as_str()),
            ),
            Ok(())
        );

        let zeros = ActionPreviewHash::parse(
            "0000000000000000000000000000000000000000000000000000000000000000",
        )
        .expect("zeros");
        assert_eq!(
            bind_proposal_preview(
                &action,
                &resource,
                &inputs,
                &zeros,
                &document.canonical_preview_text,
                Some(zeros.as_str()),
            ),
            Err(PreviewBindingError::Mismatch)
        );

        let mut tweaked = document.canonical_preview_text.clone();
        tweaked.push('!');
        assert_eq!(
            bind_proposal_preview(
                &action,
                &resource,
                &inputs,
                &stored,
                &tweaked,
                Some(stored.as_str()),
            ),
            Err(PreviewBindingError::Mismatch)
        );

        let other_resource = ResourceId::parse("inventory.item.2").expect("resource");
        assert_eq!(
            bind_proposal_preview(
                &action,
                &other_resource,
                &inputs,
                &stored,
                &document.canonical_preview_text,
                Some(stored.as_str()),
            ),
            Err(PreviewBindingError::Mismatch)
        );
    }

    #[test]
    fn personal_write_preview_stays_in_portuguese() {
        let note = build_action_preview(
            &ActionId::parse("personal.writeMemory").expect("action"),
            &ResourceId::parse("personal.note.1").expect("resource"),
            &[ActionInput {
                id: InputId::parse("body").expect("input"),
                value: ExactValue::Text("comprar pão".to_owned()),
            }],
        );
        assert_eq!(
            note.canonical_preview_text,
            "Vou guardar esta nota: comprar pão"
        );
        assert!(!note.canonical_preview_text.contains("personal.note.1"));
        assert!(!note.canonical_preview_text.contains("proposal"));
    }
}
