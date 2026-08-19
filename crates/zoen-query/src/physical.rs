use std::sync::Arc;

use datafusion::arrow::array::{Array, ArrayRef, Int64Array, StringArray, StringViewArray};
use datafusion::arrow::datatypes::{DataType, Field, Schema, SchemaRef};
use datafusion::arrow::record_batch::RecordBatch;
use sqlx::Row;
use sqlx::postgres::PgRow;

use crate::QueryError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PhysicalClaim {
    pub claim_id: String,
    pub commit_sequence: i64,
    pub definition_digest: String,
    pub definition_id: String,
    pub definition_revision: i64,
    pub entity_id: String,
    pub relation_id: String,
    pub source_digest: String,
    pub source_id: String,
    pub source_ref: String,
    pub tenant_id: String,
    pub valid_from_micros: i64,
    pub valid_time_kind: String,
    pub valid_to_micros: Option<i64>,
    pub value_kind: String,
    pub value_text: String,
    pub value_unit: Option<String>,
}

impl PhysicalClaim {
    pub(crate) fn from_postgres(row: &PgRow) -> Result<Self, QueryError> {
        Ok(Self {
            claim_id: text(row, "claim_id")?,
            commit_sequence: integer(row, "commit_sequence")?,
            definition_digest: text(row, "definition_digest")?,
            definition_id: text(row, "definition_id")?,
            definition_revision: integer(row, "definition_revision")?,
            entity_id: text(row, "entity_id")?,
            relation_id: text(row, "relation_id")?,
            source_digest: text(row, "source_digest")?,
            source_id: text(row, "source_id")?,
            source_ref: text(row, "source_ref")?,
            tenant_id: text(row, "tenant_id")?,
            valid_from_micros: integer(row, "valid_from_micros")?,
            valid_time_kind: text(row, "valid_time_kind")?,
            valid_to_micros: optional_integer(row, "valid_to_micros")?,
            value_kind: text(row, "value_kind")?,
            value_text: text(row, "value_text")?,
            value_unit: optional_text(row, "value_unit")?,
        })
    }
}

pub(crate) fn claim_schema() -> SchemaRef {
    Arc::new(Schema::new(vec![
        Field::new("tenant_id", DataType::Utf8, false),
        Field::new("claim_id", DataType::Utf8, false),
        Field::new("definition_id", DataType::Utf8, false),
        Field::new("definition_digest", DataType::Utf8, false),
        Field::new("definition_revision", DataType::Int64, false),
        Field::new("entity_id", DataType::Utf8, false),
        Field::new("relation_id", DataType::Utf8, false),
        Field::new("value_kind", DataType::Utf8, false),
        Field::new("value_text", DataType::Utf8, false),
        Field::new("value_unit", DataType::Utf8, true),
        Field::new("valid_time_kind", DataType::Utf8, false),
        Field::new("valid_from_micros", DataType::Int64, false),
        Field::new("valid_to_micros", DataType::Int64, true),
        Field::new("source_id", DataType::Utf8, false),
        Field::new("source_digest", DataType::Utf8, false),
        Field::new("source_ref", DataType::Utf8, false),
        Field::new("commit_sequence", DataType::Int64, false),
    ]))
}

pub(crate) fn claims_to_batch(rows: &[PhysicalClaim]) -> Result<RecordBatch, QueryError> {
    let columns: Vec<ArrayRef> = vec![
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.tenant_id.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.claim_id.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.definition_id.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.definition_digest.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(Int64Array::from(
            rows.iter()
                .map(|row| row.definition_revision)
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.entity_id.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.relation_id.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.value_kind.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.value_text.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.value_unit.as_deref())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.valid_time_kind.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(Int64Array::from(
            rows.iter()
                .map(|row| row.valid_from_micros)
                .collect::<Vec<_>>(),
        )),
        Arc::new(Int64Array::from(
            rows.iter()
                .map(|row| row.valid_to_micros)
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.source_id.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.source_digest.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(StringArray::from(
            rows.iter()
                .map(|row| row.source_ref.as_str())
                .collect::<Vec<_>>(),
        )),
        Arc::new(Int64Array::from(
            rows.iter()
                .map(|row| row.commit_sequence)
                .collect::<Vec<_>>(),
        )),
    ];
    RecordBatch::try_new(claim_schema(), columns)
        .map_err(|error| QueryError::Corrupt(error.to_string()))
}

pub(crate) fn batches_to_claims(batches: &[RecordBatch]) -> Result<Vec<PhysicalClaim>, QueryError> {
    let mut rows = Vec::new();
    for batch in batches {
        let tenant_ids = strings(batch, "tenant_id")?;
        let claim_ids = strings(batch, "claim_id")?;
        let definition_ids = strings(batch, "definition_id")?;
        let definition_digests = strings(batch, "definition_digest")?;
        let definition_revisions = integers(batch, "definition_revision")?;
        let entity_ids = strings(batch, "entity_id")?;
        let relation_ids = strings(batch, "relation_id")?;
        let value_kinds = strings(batch, "value_kind")?;
        let value_texts = strings(batch, "value_text")?;
        let value_units = strings(batch, "value_unit")?;
        let valid_time_kinds = strings(batch, "valid_time_kind")?;
        let valid_from = integers(batch, "valid_from_micros")?;
        let valid_to = integers(batch, "valid_to_micros")?;
        let source_ids = strings(batch, "source_id")?;
        let source_digests = strings(batch, "source_digest")?;
        let source_refs = strings(batch, "source_ref")?;
        let commit_sequences = integers(batch, "commit_sequence")?;

        for index in 0..batch.num_rows() {
            rows.push(PhysicalClaim {
                claim_id: required_string(claim_ids, index, "claim_id")?,
                commit_sequence: required_integer(commit_sequences, index, "commit_sequence")?,
                definition_digest: required_string(definition_digests, index, "definition_digest")?,
                definition_id: required_string(definition_ids, index, "definition_id")?,
                definition_revision: required_integer(
                    definition_revisions,
                    index,
                    "definition_revision",
                )?,
                entity_id: required_string(entity_ids, index, "entity_id")?,
                relation_id: required_string(relation_ids, index, "relation_id")?,
                source_digest: required_string(source_digests, index, "source_digest")?,
                source_id: required_string(source_ids, index, "source_id")?,
                source_ref: required_string(source_refs, index, "source_ref")?,
                tenant_id: required_string(tenant_ids, index, "tenant_id")?,
                valid_from_micros: required_integer(valid_from, index, "valid_from_micros")?,
                valid_time_kind: required_string(valid_time_kinds, index, "valid_time_kind")?,
                valid_to_micros: optional_array_integer(valid_to, index),
                value_kind: required_string(value_kinds, index, "value_kind")?,
                value_text: required_string(value_texts, index, "value_text")?,
                value_unit: optional_array_string(value_units, index),
            });
        }
    }
    Ok(rows)
}

#[derive(Clone, Copy)]
enum TextColumn<'a> {
    Utf8(&'a StringArray),
    Utf8View(&'a StringViewArray),
}

impl TextColumn<'_> {
    fn is_null(self, index: usize) -> bool {
        match self {
            Self::Utf8(values) => values.is_null(index),
            Self::Utf8View(values) => values.is_null(index),
        }
    }

    fn value(self, index: usize) -> &str {
        match self {
            Self::Utf8(values) => values.value(index),
            Self::Utf8View(values) => values.value(index),
        }
    }
}

fn strings<'a>(batch: &'a RecordBatch, name: &str) -> Result<TextColumn<'a>, QueryError> {
    let column = batch
        .column_by_name(name)
        .ok_or_else(|| QueryError::Corrupt(format!("Parquet projection has no {name} column")))?;
    if let Some(values) = column.as_any().downcast_ref::<StringArray>() {
        return Ok(TextColumn::Utf8(values));
    }
    if let Some(values) = column.as_any().downcast_ref::<StringViewArray>() {
        return Ok(TextColumn::Utf8View(values));
    }
    Err(QueryError::Corrupt(format!(
        "Parquet projection column {name} has unsupported type {}",
        column.data_type()
    )))
}

fn integers<'a>(batch: &'a RecordBatch, name: &str) -> Result<&'a Int64Array, QueryError> {
    batch
        .column_by_name(name)
        .ok_or_else(|| QueryError::Corrupt(format!("Parquet projection has no {name} column")))?
        .as_any()
        .downcast_ref::<Int64Array>()
        .ok_or_else(|| {
            QueryError::Corrupt(format!("Parquet projection column {name} is not int64"))
        })
}

fn required_string(values: TextColumn<'_>, index: usize, name: &str) -> Result<String, QueryError> {
    (!values.is_null(index))
        .then(|| values.value(index).to_owned())
        .ok_or_else(|| QueryError::Corrupt(format!("Parquet projection column {name} is null")))
}

fn required_integer(values: &Int64Array, index: usize, name: &str) -> Result<i64, QueryError> {
    (!values.is_null(index))
        .then(|| values.value(index))
        .ok_or_else(|| QueryError::Corrupt(format!("Parquet projection column {name} is null")))
}

fn optional_array_string(values: TextColumn<'_>, index: usize) -> Option<String> {
    (!values.is_null(index)).then(|| values.value(index).to_owned())
}

fn optional_array_integer(values: &Int64Array, index: usize) -> Option<i64> {
    (!values.is_null(index)).then(|| values.value(index))
}

fn text(row: &PgRow, column: &str) -> Result<String, QueryError> {
    row.try_get::<String, _>(column)
        .map_err(|error| QueryError::Unavailable(error.to_string()))
}

fn optional_text(row: &PgRow, column: &str) -> Result<Option<String>, QueryError> {
    row.try_get::<Option<String>, _>(column)
        .map_err(|error| QueryError::Unavailable(error.to_string()))
}

fn integer(row: &PgRow, column: &str) -> Result<i64, QueryError> {
    row.try_get::<i64, _>(column)
        .map_err(|error| QueryError::Unavailable(error.to_string()))
}

fn optional_integer(row: &PgRow, column: &str) -> Result<Option<i64>, QueryError> {
    row.try_get::<Option<i64>, _>(column)
        .map_err(|error| QueryError::Unavailable(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_datafusion_string_views() {
        let schema = Arc::new(Schema::new(vec![Field::new(
            "tenant_id",
            DataType::Utf8View,
            false,
        )]));
        let batch = RecordBatch::try_new(
            schema,
            vec![Arc::new(StringViewArray::from(vec!["tenant.a"]))],
        )
        .expect("valid string view batch");

        let tenant_ids = strings(&batch, "tenant_id").expect("tenant column");

        assert_eq!(
            required_string(tenant_ids, 0, "tenant_id").expect("tenant value"),
            "tenant.a"
        );
    }
}
