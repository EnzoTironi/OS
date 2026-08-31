use std::fmt::Write as _;

use crate::{ActionId, ActionInput, ExactValue, ResourceId};

/// Schema id hashed into every Action preview document.
pub const ACTION_PREVIEW_SCHEMA: &str = "zoen.action.preview.v1";

/// Locale frozen for V1 preview text. A locale change needs a new schema.
pub const ACTION_PREVIEW_LOCALE: &str = "pt-BR";

/// One normalized Action input as it appears in the JCS preview document.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionPreviewInput {
    pub amount: Option<String>,
    pub id: String,
    pub kind: String,
    pub unit: Option<String>,
    pub value: Option<String>,
    pub value_bool: Option<bool>,
}

/// User-safe Action preview. Kernel hashes RFC 8785 JCS of this document.
///
/// Internal IDs (proposal, operation, claim, tenant, principal) stay out of
/// `canonical_preview_text`. `action` and `resource` bind the hash.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionPreviewDocument {
    pub action: String,
    pub canonical_preview_text: String,
    pub inputs: Vec<ActionPreviewInput>,
    pub locale: String,
    pub resource: String,
    pub schema: String,
}

impl ActionPreviewDocument {
    pub fn from_action(
        action_id: &ActionId,
        resource_id: &ResourceId,
        inputs: &[ActionInput],
    ) -> Self {
        let mut preview_inputs = inputs
            .iter()
            .map(ActionPreviewInput::from_action_input)
            .collect::<Vec<_>>();
        preview_inputs.sort_by(|left, right| left.id.cmp(&right.id));
        Self {
            action: action_id.as_str().to_owned(),
            canonical_preview_text: canonical_preview_text(action_id.as_str(), inputs),
            inputs: preview_inputs,
            locale: ACTION_PREVIEW_LOCALE.to_owned(),
            resource: resource_id.as_str().to_owned(),
            schema: ACTION_PREVIEW_SCHEMA.to_owned(),
        }
    }

    /// JSON object ready for RFC 8785 JCS. Key order is not significant.
    #[must_use]
    pub fn to_json(&self) -> String {
        let mut out = String::from("{");
        write_json_member(&mut out, "action", true);
        write_json_string(&mut out, &self.action);
        write_json_member(&mut out, "canonical_preview_text", false);
        write_json_string(&mut out, &self.canonical_preview_text);
        out.push_str(",\"inputs\":[");
        for (index, input) in self.inputs.iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            out.push_str(&input.to_json());
        }
        out.push(']');
        write_json_member(&mut out, "locale", false);
        write_json_string(&mut out, &self.locale);
        write_json_member(&mut out, "resource", false);
        write_json_string(&mut out, &self.resource);
        write_json_member(&mut out, "schema", false);
        write_json_string(&mut out, &self.schema);
        out.push('}');
        out
    }
}

impl ActionPreviewInput {
    fn from_action_input(input: &ActionInput) -> Self {
        match &input.value {
            ExactValue::Bool(value) => Self {
                amount: None,
                id: input.id.as_str().to_owned(),
                kind: "bool".to_owned(),
                unit: None,
                value: None,
                value_bool: Some(*value),
            },
            ExactValue::Decimal(value) => Self {
                amount: None,
                id: input.id.as_str().to_owned(),
                kind: "decimal".to_owned(),
                unit: None,
                value: Some(value.as_str().to_owned()),
                value_bool: None,
            },
            ExactValue::Entity(value) => Self {
                amount: None,
                id: input.id.as_str().to_owned(),
                kind: "entity".to_owned(),
                unit: None,
                value: Some(value.as_str().to_owned()),
                value_bool: None,
            },
            ExactValue::Integer(value) => Self {
                amount: None,
                id: input.id.as_str().to_owned(),
                kind: "integer".to_owned(),
                unit: None,
                value: Some(value.as_str().to_owned()),
                value_bool: None,
            },
            ExactValue::Quantity { amount, unit } => Self {
                amount: Some(amount.as_str().to_owned()),
                id: input.id.as_str().to_owned(),
                kind: "quantity".to_owned(),
                unit: Some(unit.as_str().to_owned()),
                value: None,
                value_bool: None,
            },
            ExactValue::Text(value) => Self {
                amount: None,
                id: input.id.as_str().to_owned(),
                kind: "text".to_owned(),
                unit: None,
                value: Some(value.clone()),
                value_bool: None,
            },
        }
    }

    fn to_json(&self) -> String {
        let mut out = String::from("{");
        if let Some(amount) = &self.amount {
            write_json_member(&mut out, "amount", true);
            write_json_string(&mut out, amount);
        }
        write_json_member(&mut out, "id", self.amount.is_none());
        write_json_string(&mut out, &self.id);
        write_json_member(&mut out, "kind", false);
        write_json_string(&mut out, &self.kind);
        if let Some(unit) = &self.unit {
            write_json_member(&mut out, "unit", false);
            write_json_string(&mut out, unit);
        }
        if let Some(value) = &self.value {
            write_json_member(&mut out, "value", false);
            write_json_string(&mut out, value);
        }
        if let Some(value) = self.value_bool {
            write_json_member(&mut out, "value", false);
            out.push_str(if value { "true" } else { "false" });
        }
        out.push('}');
        out
    }
}

/// Deterministic PT-BR preview. Does not mention proposal, operation, or claim IDs.
#[must_use]
pub fn canonical_preview_text(action_id: &str, inputs: &[ActionInput]) -> String {
    match action_id {
        "personal.writeMemory" => {
            format!(
                "Vou guardar esta nota: {}",
                text_input(inputs, "body").unwrap_or("")
            )
        }
        "personal.createReminder" => {
            format!(
                "Vou criar este lembrete para {}: {}",
                text_input(inputs, "dueAt").unwrap_or(""),
                text_input(inputs, "body").unwrap_or("")
            )
        }
        other => {
            let label = action_label(other);
            if let Some(quantity) = display_input(inputs, "quantity") {
                format!("Vou executar {label} com quantidade {quantity}.")
            } else {
                format!("Vou executar {label}.")
            }
        }
    }
}

fn action_label(action_id: &str) -> &str {
    action_id.rsplit('.').next().unwrap_or(action_id)
}

fn text_input<'a>(inputs: &'a [ActionInput], id: &str) -> Option<&'a str> {
    inputs.iter().find_map(|input| {
        if input.id.as_str() != id {
            return None;
        }
        match &input.value {
            ExactValue::Text(value) => Some(value.as_str()),
            _ => None,
        }
    })
}

fn display_input(inputs: &[ActionInput], id: &str) -> Option<String> {
    inputs.iter().find_map(|input| {
        if input.id.as_str() != id {
            return None;
        }
        Some(display_exact_value(&input.value))
    })
}

fn display_exact_value(value: &ExactValue) -> String {
    match value {
        ExactValue::Bool(value) => value.to_string(),
        ExactValue::Decimal(value) => value.as_str().to_owned(),
        ExactValue::Entity(value) => value.as_str().to_owned(),
        ExactValue::Integer(value) => value.as_str().to_owned(),
        ExactValue::Quantity { amount, unit } => {
            format!("{} {}", amount.as_str(), unit.as_str())
        }
        ExactValue::Text(value) => value.clone(),
    }
}

fn write_json_member(out: &mut String, key: &str, first: bool) {
    if !first {
        out.push(',');
    }
    write_json_string(out, key);
    out.push(':');
}

fn write_json_string(out: &mut String, value: &str) {
    out.push('"');
    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            character if u32::from(character) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", u32::from(character));
            }
            character => out.push(character),
        }
    }
    out.push('"');
}
