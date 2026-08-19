use sqlx::Row;
use sqlx::postgres::PgRow;
use zoen_core::{
    EntityId, ExactDecimal, ExactInteger, ExactValue, TimestampMicros, UnitId, ValidTime,
};
use zoen_engine::StoreError;

use crate::{row_string, store_unavailable};

pub(crate) fn value_columns(value: &ExactValue) -> (&'static str, String, Option<&str>) {
    match value {
        ExactValue::Bool(value) => ("bool", value.to_string(), None),
        ExactValue::Decimal(value) => ("decimal", value.as_str().to_owned(), None),
        ExactValue::Entity(value) => ("entity", value.as_str().to_owned(), None),
        ExactValue::Integer(value) => ("integer", value.as_str().to_owned(), None),
        ExactValue::Quantity { amount, unit } => {
            ("quantity", amount.as_str().to_owned(), Some(unit.as_str()))
        }
        ExactValue::Text(value) => ("text", value.clone(), None),
    }
}

pub(crate) fn valid_time_columns(valid_time: &ValidTime) -> (&'static str, i64, Option<i64>) {
    match valid_time {
        ValidTime::Instant(at) => ("instant", at.get(), None),
        ValidTime::Interval { start, end } => ("interval", start.get(), Some(end.get())),
    }
}

pub(crate) fn row_to_value(row: &PgRow) -> Result<ExactValue, StoreError> {
    let kind = row_string(row, "value_kind")?;
    let value = row_string(row, "value_text")?;
    match kind.as_str() {
        "bool" => match value.as_str() {
            "true" => Ok(ExactValue::Bool(true)),
            "false" => Ok(ExactValue::Bool(false)),
            _ => Err(StoreError::Corrupt(format!(
                "invalid stored boolean: {value}"
            ))),
        },
        "decimal" => ExactDecimal::parse(value)
            .map(ExactValue::Decimal)
            .map_err(|error| StoreError::Corrupt(error.to_string())),
        "entity" => EntityId::parse(value)
            .map(ExactValue::Entity)
            .map_err(|error| StoreError::Corrupt(error.to_string())),
        "integer" => ExactInteger::parse(value)
            .map(ExactValue::Integer)
            .map_err(|error| StoreError::Corrupt(error.to_string())),
        "quantity" => {
            let unit = row
                .try_get::<Option<String>, _>("value_unit")
                .map_err(store_unavailable)?
                .ok_or_else(|| StoreError::Corrupt("quantity has no unit".to_owned()))?;
            Ok(ExactValue::Quantity {
                amount: ExactDecimal::parse(value)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                unit: UnitId::parse(unit)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            })
        }
        "text" => Ok(ExactValue::Text(value)),
        _ => Err(StoreError::Corrupt(format!(
            "unknown stored value kind: {kind}"
        ))),
    }
}

pub(crate) fn row_to_valid_time(row: &PgRow) -> Result<ValidTime, StoreError> {
    let kind = row_string(row, "valid_time_kind")?;
    let start = TimestampMicros::new(
        row.try_get::<i64, _>("valid_from_micros")
            .map_err(store_unavailable)?,
    );
    let end = row
        .try_get::<Option<i64>, _>("valid_to_micros")
        .map_err(store_unavailable)?
        .map(TimestampMicros::new);
    match (kind.as_str(), end) {
        ("instant", None) => Ok(ValidTime::instant(start)),
        ("interval", Some(end)) => {
            ValidTime::interval(start, end).map_err(|error| StoreError::Corrupt(error.to_string()))
        }
        _ => Err(StoreError::Corrupt(
            "stored valid-time shape is inconsistent".to_owned(),
        )),
    }
}
