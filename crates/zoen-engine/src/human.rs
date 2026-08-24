use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use zoen_core::{
    ActionId, ActionInput, ActionProposal, DisclosureClass, EffectAttemptId, EffectPayloadKind,
    EffectRequest, EffectRequestDigest, EvidenceFieldSpec, ExactValue, HUMAN_TASK_SCHEMA_VERSION,
    HumanContactRef, HumanExecutorClass, HumanInputValue, HumanTaskBounds, HumanTaskContract,
    HumanTaskError, HumanTaskPacket, ReconciliationPolicy, TimestampMicros,
    project_human_task_packet_from_contract, validate_human_task_contract,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HumanTaskContractWire {
    schema_version: u32,
    executor_class: String,
    instruction: String,
    #[serde(default)]
    structured_inputs: BTreeMap<String, HumanInputValueWire>,
    #[serde(default)]
    contact: Option<HumanContactRefWire>,
    bounds: HumanTaskBoundsWire,
    expiry_micros: i64,
    #[serde(default)]
    required_evidence: Vec<EvidenceFieldSpecWire>,
    reconciliation: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
enum HumanInputValueWire {
    Text { value: String },
    Integer { value: i64 },
    Boolean { value: bool },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HumanContactRefWire {
    name_ref: Option<String>,
    phone_ref: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HumanTaskBoundsWire {
    max_expense_minor: Option<i64>,
    #[serde(default)]
    allowed_actions: Vec<String>,
    disclosure_class: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceFieldSpecWire {
    field_id: String,
    required: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HumanPacketError {
    Core(HumanTaskError),
    Encoding(String),
}

impl Display for HumanPacketError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Core(error) => error.fmt(formatter),
            Self::Encoding(message) => write!(formatter, "human task encoding error: {message}"),
        }
    }
}

impl Error for HumanPacketError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Core(error) => Some(error),
            Self::Encoding(_) => None,
        }
    }
}

pub fn effect_payload_kind(payload: &[u8]) -> EffectPayloadKind {
    match parse_human_task_contract(payload) {
        Ok(_) => EffectPayloadKind::HumanTask,
        Err(_) => EffectPayloadKind::ExternalBytes,
    }
}

pub fn is_human_task_payload(payload: &[u8]) -> bool {
    matches!(effect_payload_kind(payload), EffectPayloadKind::HumanTask)
}

pub fn parse_human_task_contract(payload: &[u8]) -> Result<HumanTaskContract, HumanPacketError> {
    let wire: HumanTaskContractWire = serde_json::from_slice(payload)
        .map_err(|error| HumanPacketError::Encoding(error.to_string()))?;
    if wire.schema_version != HUMAN_TASK_SCHEMA_VERSION {
        return Err(HumanPacketError::Core(
            HumanTaskError::InvalidSchemaVersion(wire.schema_version),
        ));
    }
    let contract = HumanTaskContract {
        schema_version: wire.schema_version,
        executor_class: HumanExecutorClass::parse(&wire.executor_class)
            .map_err(HumanPacketError::Core)?,
        instruction: wire.instruction,
        structured_inputs: wire
            .structured_inputs
            .into_iter()
            .map(|(key, value)| {
                (
                    key,
                    match value {
                        HumanInputValueWire::Text { value } => HumanInputValue::Text(value),
                        HumanInputValueWire::Integer { value } => HumanInputValue::Integer(value),
                        HumanInputValueWire::Boolean { value } => HumanInputValue::Boolean(value),
                    },
                )
            })
            .collect(),
        contact: wire.contact.map(|contact| HumanContactRef {
            name_ref: contact.name_ref,
            phone_ref: contact.phone_ref,
        }),
        bounds: HumanTaskBounds {
            max_expense_minor: wire.bounds.max_expense_minor,
            allowed_actions: wire.bounds.allowed_actions,
            disclosure_class: DisclosureClass::parse(&wire.bounds.disclosure_class)
                .map_err(HumanPacketError::Core)?,
        },
        expiry: TimestampMicros::new(wire.expiry_micros),
        required_evidence: wire
            .required_evidence
            .into_iter()
            .map(|field| EvidenceFieldSpec {
                field_id: field.field_id,
                required: field.required,
            })
            .collect(),
        reconciliation: ReconciliationPolicy::parse(&wire.reconciliation)
            .map_err(HumanPacketError::Core)?,
    };
    validate_human_task_contract(&contract).map_err(HumanPacketError::Core)?;
    Ok(contract)
}

pub fn encode_human_task_contract(
    contract: &HumanTaskContract,
) -> Result<Vec<u8>, HumanPacketError> {
    validate_human_task_contract(contract).map_err(HumanPacketError::Core)?;
    let mut structured_inputs = serde_json::Map::new();
    for (key, value) in &contract.structured_inputs {
        let encoded = match value {
            HumanInputValue::Text(value) => serde_json::json!({ "kind": "text", "value": value }),
            HumanInputValue::Integer(value) => {
                serde_json::json!({ "kind": "integer", "value": value })
            }
            HumanInputValue::Boolean(value) => {
                serde_json::json!({ "kind": "boolean", "value": value })
            }
        };
        structured_inputs.insert(key.clone(), encoded);
    }
    let body = serde_json::json!({
        "schemaVersion": contract.schema_version,
        "executorClass": contract.executor_class.as_str(),
        "instruction": contract.instruction,
        "structuredInputs": structured_inputs,
        "contact": contract.contact.as_ref().map(|contact| serde_json::json!({
            "nameRef": contact.name_ref,
            "phoneRef": contact.phone_ref,
        })),
        "bounds": {
            "maxExpenseMinor": contract.bounds.max_expense_minor,
            "allowedActions": contract.bounds.allowed_actions,
            "disclosureClass": contract.bounds.disclosure_class.as_str(),
        },
        "expiryMicros": contract.expiry.get(),
        "requiredEvidence": contract.required_evidence.iter().map(|field| serde_json::json!({
            "fieldId": field.field_id,
            "required": field.required,
        })).collect::<Vec<_>>(),
        "reconciliation": contract.reconciliation.as_str(),
    });
    serde_json::to_vec(&body).map_err(|error| HumanPacketError::Encoding(error.to_string()))
}

pub fn request_digest_for_payload(payload: &[u8]) -> EffectRequestDigest {
    let digest = Sha256::digest(payload);
    EffectRequestDigest::parse(hex_digest(&digest)).expect("sha256 hex is a valid digest")
}

pub fn is_human_executor_action(action_id: &ActionId) -> bool {
    action_id.as_str().ends_with(".humanExecutor")
}

pub fn mint_human_task_contract_payload(
    proposal: &ActionProposal,
) -> Result<Vec<u8>, HumanPacketError> {
    encode_human_task_contract(&mint_human_task_contract(proposal)?)
}

pub fn mint_human_task_contract(
    proposal: &ActionProposal,
) -> Result<HumanTaskContract, HumanPacketError> {
    let inputs = index_inputs(&proposal.inputs);
    let instruction = text_input(&inputs, "instruction")
        .unwrap_or_else(|| "Collect wet signature for order".to_owned());
    let contact_name = text_input(&inputs, "contact_name_ref");
    let contact_phone = text_input(&inputs, "contact_phone_ref");
    let contact = match (contact_name, contact_phone) {
        (None, None) => Some(HumanContactRef {
            name_ref: Some("contact.name.1".to_owned()),
            phone_ref: None,
        }),
        (name_ref, phone_ref) => Some(HumanContactRef {
            name_ref,
            phone_ref,
        }),
    };
    let max_expense_minor = integer_input(&inputs, "max_expense_minor")?.or(Some(0));
    let disclosure_class = match text_input(&inputs, "disclosure_class")
        .as_deref()
        .unwrap_or("minimal")
    {
        "standard" => DisclosureClass::Standard,
        "minimal" => DisclosureClass::Minimal,
        other => {
            return Err(HumanPacketError::Core(
                HumanTaskError::InvalidDisclosureClass(other.to_owned()),
            ));
        }
    };
    let reconciliation = match text_input(&inputs, "reconciliation")
        .as_deref()
        .unwrap_or("required_independent")
    {
        "operator_attempt_sufficient" => ReconciliationPolicy::OperatorAttemptSufficient,
        "required_independent" => ReconciliationPolicy::RequiredIndependent,
        other => {
            return Err(HumanPacketError::Core(
                HumanTaskError::InvalidReconciliationPolicy(other.to_owned()),
            ));
        }
    };
    let allowed_actions = match text_input(&inputs, "allowed_action") {
        Some(action) => vec![action],
        None => vec!["collect_signature".to_owned()],
    };
    let required_evidence = match text_input(&inputs, "required_evidence_field") {
        Some(field_id) => vec![EvidenceFieldSpec {
            field_id,
            required: true,
        }],
        None => vec![EvidenceFieldSpec {
            field_id: "signed_form".to_owned(),
            required: true,
        }],
    };
    let mut structured_inputs = BTreeMap::new();
    for (key, value) in &inputs {
        if RESERVED_HUMAN_INPUTS.contains(&key.as_str()) {
            continue;
        }
        if let Some(human_value) = human_input_value(value)? {
            structured_inputs.insert(key.clone(), human_value);
        }
    }
    let contract = HumanTaskContract {
        schema_version: HUMAN_TASK_SCHEMA_VERSION,
        executor_class: HumanExecutorClass::HumanExecutor,
        instruction,
        structured_inputs,
        contact,
        bounds: HumanTaskBounds {
            max_expense_minor,
            allowed_actions,
            disclosure_class,
        },
        expiry: proposal.expires_at,
        required_evidence,
        reconciliation,
    };
    validate_human_task_contract(&contract).map_err(HumanPacketError::Core)?;
    Ok(contract)
}

const RESERVED_HUMAN_INPUTS: &[&str] = &[
    "allowed_action",
    "contact_name_ref",
    "contact_phone_ref",
    "disclosure_class",
    "instruction",
    "max_expense_minor",
    "quantity",
    "reconciliation",
    "required_evidence_field",
];

fn index_inputs(inputs: &[ActionInput]) -> BTreeMap<String, ExactValue> {
    inputs
        .iter()
        .map(|input| (input.id.as_str().to_owned(), input.value.clone()))
        .collect()
}

fn text_input(inputs: &BTreeMap<String, ExactValue>, key: &str) -> Option<String> {
    match inputs.get(key) {
        Some(ExactValue::Text(value)) => Some(value.clone()),
        _ => None,
    }
}

fn integer_input(
    inputs: &BTreeMap<String, ExactValue>,
    key: &str,
) -> Result<Option<i64>, HumanPacketError> {
    match inputs.get(key) {
        Some(ExactValue::Integer(value)) => value
            .as_str()
            .parse::<i64>()
            .map(Some)
            .map_err(|error| HumanPacketError::Encoding(error.to_string())),
        Some(_) => Err(HumanPacketError::Encoding(format!(
            "human task input {key} must be an integer"
        ))),
        None => Ok(None),
    }
}

fn human_input_value(value: &ExactValue) -> Result<Option<HumanInputValue>, HumanPacketError> {
    match value {
        ExactValue::Bool(value) => Ok(Some(HumanInputValue::Boolean(*value))),
        ExactValue::Integer(value) => {
            let parsed = value
                .as_str()
                .parse::<i64>()
                .map_err(|error| HumanPacketError::Encoding(error.to_string()))?;
            Ok(Some(HumanInputValue::Integer(parsed)))
        }
        ExactValue::Text(value) => Ok(Some(HumanInputValue::Text(value.clone()))),
        ExactValue::Decimal(_) | ExactValue::Entity(_) | ExactValue::Quantity { .. } => Ok(None),
    }
}

pub fn project_human_task_packet(
    request: &EffectRequest,
    attempt_id: &EffectAttemptId,
    now: TimestampMicros,
) -> Result<HumanTaskPacket, HumanPacketError> {
    let digest = request_digest_for_payload(&request.payload);
    if digest != request.request_digest {
        return Err(HumanPacketError::Core(HumanTaskError::DigestMismatch));
    }
    let contract = parse_human_task_contract(&request.payload)?;
    project_human_task_packet_from_contract(
        request.effect_request_id.clone(),
        attempt_id.clone(),
        request.request_digest.clone(),
        &contract,
        now,
    )
    .map_err(HumanPacketError::Core)
}

fn hex_digest(digest: &[u8]) -> String {
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use zoen_core::{ActionId, HumanExecutorClass, ReconciliationPolicy};

    #[test]
    fn human_executor_action_suffix() {
        let human = ActionId::parse("inventory.collectSignature.humanExecutor").expect("id");
        let software = ActionId::parse("inventory.requestStock").expect("id");
        assert!(is_human_executor_action(&human));
        assert!(!is_human_executor_action(&software));
    }

    #[test]
    fn round_trip_contract_bytes() {
        let contract = HumanTaskContract {
            schema_version: HUMAN_TASK_SCHEMA_VERSION,
            executor_class: HumanExecutorClass::HumanExecutor,
            instruction: "Visit site".to_owned(),
            structured_inputs: BTreeMap::from([(
                "order_id".to_owned(),
                HumanInputValue::Text("order.1".to_owned()),
            )]),
            contact: Some(HumanContactRef {
                name_ref: Some("contact.name.1".to_owned()),
                phone_ref: None,
            }),
            bounds: HumanTaskBounds {
                max_expense_minor: Some(500),
                allowed_actions: vec!["visit".to_owned()],
                disclosure_class: DisclosureClass::Standard,
            },
            expiry: TimestampMicros::new(9_000_000_000_000_000),
            required_evidence: vec![EvidenceFieldSpec {
                field_id: "photo".to_owned(),
                required: true,
            }],
            reconciliation: ReconciliationPolicy::RequiredIndependent,
        };
        let bytes = encode_human_task_contract(&contract).expect("encode");
        let parsed = parse_human_task_contract(&bytes).expect("parse");
        assert_eq!(parsed, contract);
        assert!(is_human_task_payload(&bytes));
    }
}
