use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt::{Display, Formatter};

use crate::{EntityId, InputId, RelationId, SemanticValue, UnitId};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactIntegerError(String);

impl Display for ExactIntegerError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "noncanonical exact integer: {:?}", self.0)
    }
}

impl Error for ExactIntegerError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactInteger(String);

impl ExactInteger {
    pub fn parse(value: impl Into<String>) -> Result<Self, ExactIntegerError> {
        let value = value.into();
        if is_canonical_integer(&value) {
            Ok(Self(value))
        } else {
            Err(ExactIntegerError(value))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn is_canonical_integer(value: &str) -> bool {
    match value.as_bytes() {
        [b'0'] => true,
        [b'-', first, rest @ ..] | [first, rest @ ..] => {
            matches!(first, b'1'..=b'9') && rest.iter().all(u8::is_ascii_digit)
        }
        [] => false,
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactDecimalError(String);

impl Display for ExactDecimalError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "noncanonical exact decimal: {:?}", self.0)
    }
}

impl Error for ExactDecimalError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactDecimal(String);

impl ExactDecimal {
    pub fn parse(value: impl Into<String>) -> Result<Self, ExactDecimalError> {
        let value = value.into();
        if is_canonical_decimal(&value) {
            Ok(Self(value))
        } else {
            Err(ExactDecimalError(value))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn is_canonical_decimal(value: &str) -> bool {
    let magnitude = value.strip_prefix('-').unwrap_or(value);
    if magnitude.is_empty() || magnitude == "0" && value.starts_with('-') {
        return false;
    }

    let mut parts = magnitude.split('.');
    let integer = parts.next().unwrap_or_default();
    let fraction = parts.next();
    if parts.next().is_some()
        || integer.is_empty()
        || !integer.bytes().all(|byte| byte.is_ascii_digit())
        || integer.len() > 1 && integer.starts_with('0')
    {
        return false;
    }

    match fraction {
        None => true,
        Some(fraction) => {
            !fraction.is_empty()
                && fraction.bytes().all(|byte| byte.is_ascii_digit())
                && !fraction.ends_with('0')
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ValueType {
    Bool,
    Decimal,
    Integer,
    Quantity { unit: UnitId },
    Text,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExactValue {
    Bool(bool),
    Decimal(ExactDecimal),
    Entity(EntityId),
    Integer(ExactInteger),
    Quantity { amount: ExactDecimal, unit: UnitId },
    Text(String),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BinaryOperator {
    Add,
    GreaterThan,
    Multiply,
    Subtract,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Expression {
    Binary {
        left: Box<Expression>,
        operator: BinaryOperator,
        right: Box<Expression>,
    },
    Input(InputId),
    Literal(ExactValue),
    Relation(RelationId),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExpressionEvaluationError {
    IntegerOutOfRange(&'static str),
    IntegerOverflow(&'static str),
    InvalidOperands,
    MissingInput(InputId),
}

impl Display for ExpressionEvaluationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IntegerOutOfRange(side) => {
                write!(formatter, "{side} integer exceeds i128")
            }
            Self::IntegerOverflow(operation) => {
                write!(formatter, "integer {operation} overflowed i128")
            }
            Self::InvalidOperands => {
                formatter.write_str("expression operator does not support these exact operands")
            }
            Self::MissingInput(input_id) => {
                write!(formatter, "missing expression input {}", input_id.as_str())
            }
        }
    }
}

impl Error for ExpressionEvaluationError {}

pub fn expression_relations(expression: &Expression) -> BTreeSet<RelationId> {
    let mut relations = BTreeSet::new();
    collect_expression_relations(expression, &mut relations);
    relations
}

pub fn evaluate_expression(
    expression: &Expression,
    inputs: &BTreeMap<InputId, ExactValue>,
    relations: &BTreeMap<RelationId, Vec<SemanticValue>>,
) -> Result<Vec<SemanticValue>, ExpressionEvaluationError> {
    match expression {
        Expression::Binary {
            left,
            operator,
            right,
        } => {
            let left = evaluate_expression(left, inputs, relations)?;
            let right = evaluate_expression(right, inputs, relations)?;
            let mut values = Vec::with_capacity(left.len().saturating_mul(right.len()));
            for left in &left {
                for right in &right {
                    let mut dependencies =
                        Vec::with_capacity(left.dependencies.len() + right.dependencies.len());
                    dependencies.extend(left.dependencies.iter().cloned());
                    dependencies.extend(right.dependencies.iter().cloned());
                    values.push(SemanticValue {
                        dependencies,
                        value: apply_expression_operator(*operator, &left.value, &right.value)?,
                    });
                }
            }
            Ok(values)
        }
        Expression::Input(input_id) => inputs
            .get(input_id)
            .cloned()
            .map(|value| {
                vec![SemanticValue {
                    dependencies: Vec::new(),
                    value,
                }]
            })
            .ok_or_else(|| ExpressionEvaluationError::MissingInput(input_id.clone())),
        Expression::Literal(value) => Ok(vec![SemanticValue {
            dependencies: Vec::new(),
            value: value.clone(),
        }]),
        Expression::Relation(relation_id) => {
            Ok(relations.get(relation_id).cloned().unwrap_or_default())
        }
    }
}

fn collect_expression_relations(expression: &Expression, relations: &mut BTreeSet<RelationId>) {
    match expression {
        Expression::Binary { left, right, .. } => {
            collect_expression_relations(left, relations);
            collect_expression_relations(right, relations);
        }
        Expression::Relation(relation_id) => {
            relations.insert(relation_id.clone());
        }
        Expression::Input(_) | Expression::Literal(_) => {}
    }
}

pub(crate) fn apply_expression_operator(
    operator: BinaryOperator,
    left: &ExactValue,
    right: &ExactValue,
) -> Result<ExactValue, ExpressionEvaluationError> {
    match (left, right) {
        (ExactValue::Integer(left), ExactValue::Integer(right)) => {
            apply_integer_operator(operator, left, right)
        }
        (ExactValue::Decimal(left), ExactValue::Decimal(right)) => match operator {
            BinaryOperator::Add | BinaryOperator::Subtract => {
                apply_decimal_operator(operator, left, right).map(ExactValue::Decimal)
            }
            BinaryOperator::GreaterThan => {
                Ok(ExactValue::Bool(compare_decimals(left, right).is_gt()))
            }
            BinaryOperator::Multiply => Err(ExpressionEvaluationError::InvalidOperands),
        },
        (
            ExactValue::Quantity {
                amount: left,
                unit: left_unit,
            },
            ExactValue::Quantity {
                amount: right,
                unit: right_unit,
            },
        ) if left_unit == right_unit => match operator {
            BinaryOperator::Add | BinaryOperator::Subtract => {
                apply_decimal_operator(operator, left, right).map(|amount| ExactValue::Quantity {
                    amount,
                    unit: left_unit.clone(),
                })
            }
            BinaryOperator::GreaterThan => {
                Ok(ExactValue::Bool(compare_decimals(left, right).is_gt()))
            }
            BinaryOperator::Multiply => Err(ExpressionEvaluationError::InvalidOperands),
        },
        _ => Err(ExpressionEvaluationError::InvalidOperands),
    }
}

fn apply_integer_operator(
    operator: BinaryOperator,
    left: &ExactInteger,
    right: &ExactInteger,
) -> Result<ExactValue, ExpressionEvaluationError> {
    let left = left
        .as_str()
        .parse::<i128>()
        .map_err(|_| ExpressionEvaluationError::IntegerOutOfRange("left"))?;
    let right = right
        .as_str()
        .parse::<i128>()
        .map_err(|_| ExpressionEvaluationError::IntegerOutOfRange("right"))?;
    match operator {
        BinaryOperator::Add => checked_expression_integer(left.checked_add(right), "addition"),
        BinaryOperator::GreaterThan => Ok(ExactValue::Bool(left > right)),
        BinaryOperator::Multiply => {
            checked_expression_integer(left.checked_mul(right), "multiplication")
        }
        BinaryOperator::Subtract => {
            checked_expression_integer(left.checked_sub(right), "subtraction")
        }
    }
}

fn apply_decimal_operator(
    operator: BinaryOperator,
    left: &ExactDecimal,
    right: &ExactDecimal,
) -> Result<ExactDecimal, ExpressionEvaluationError> {
    match operator {
        BinaryOperator::Add => Ok(add_decimals(left, right, false)),
        BinaryOperator::Subtract => Ok(add_decimals(left, right, true)),
        BinaryOperator::GreaterThan | BinaryOperator::Multiply => {
            Err(ExpressionEvaluationError::InvalidOperands)
        }
    }
}

#[derive(Clone)]
struct DecimalParts {
    digits: Vec<u8>,
    negative: bool,
    scale: usize,
}

fn decimal_parts(value: &ExactDecimal) -> DecimalParts {
    let (negative, magnitude) = value
        .as_str()
        .strip_prefix('-')
        .map_or((false, value.as_str()), |magnitude| (true, magnitude));
    let scale = magnitude
        .split_once('.')
        .map_or(0, |(_, fraction)| fraction.len());
    let digits = magnitude
        .bytes()
        .filter(|byte| *byte != b'.')
        .map(|byte| byte - b'0')
        .collect();
    DecimalParts {
        digits,
        negative,
        scale,
    }
}

fn add_decimals(left: &ExactDecimal, right: &ExactDecimal, subtract: bool) -> ExactDecimal {
    let left = decimal_parts(left);
    let mut right = decimal_parts(right);
    right.negative ^= subtract;
    let (left_digits, right_digits, scale) = aligned_magnitudes(&left, &right);
    let (digits, negative) = if left.negative == right.negative {
        (add_magnitudes(&left_digits, &right_digits), left.negative)
    } else {
        match left_digits.cmp(&right_digits) {
            Ordering::Greater => (
                subtract_magnitudes(&left_digits, &right_digits),
                left.negative,
            ),
            Ordering::Less => (
                subtract_magnitudes(&right_digits, &left_digits),
                right.negative,
            ),
            Ordering::Equal => (vec![0], false),
        }
    };
    ExactDecimal(render_decimal(digits, scale, negative))
}

fn compare_decimals(left: &ExactDecimal, right: &ExactDecimal) -> Ordering {
    let left = decimal_parts(left);
    let right = decimal_parts(right);
    if left.negative != right.negative {
        return if left.negative {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }
    let (left_digits, right_digits, _) = aligned_magnitudes(&left, &right);
    let ordering = left_digits.cmp(&right_digits);
    if left.negative {
        ordering.reverse()
    } else {
        ordering
    }
}

fn aligned_magnitudes(left: &DecimalParts, right: &DecimalParts) -> (Vec<u8>, Vec<u8>, usize) {
    let scale = left.scale.max(right.scale);
    let mut left_digits = left.digits.clone();
    let mut right_digits = right.digits.clone();
    left_digits.resize(left_digits.len() + scale - left.scale, 0);
    right_digits.resize(right_digits.len() + scale - right.scale, 0);
    let width = left_digits.len().max(right_digits.len());
    (
        left_pad(left_digits, width),
        left_pad(right_digits, width),
        scale,
    )
}

fn left_pad(digits: Vec<u8>, width: usize) -> Vec<u8> {
    let mut padded = vec![0; width - digits.len()];
    padded.extend(digits);
    padded
}

fn add_magnitudes(left: &[u8], right: &[u8]) -> Vec<u8> {
    let mut result = vec![0; left.len() + 1];
    let mut carry = 0;
    for index in (0..left.len()).rev() {
        let sum = left[index] + right[index] + carry;
        result[index + 1] = sum % 10;
        carry = sum / 10;
    }
    result[0] = carry;
    result
}

fn subtract_magnitudes(left: &[u8], right: &[u8]) -> Vec<u8> {
    let mut result = vec![0; left.len()];
    let mut borrow = 0_i16;
    for index in (0..left.len()).rev() {
        let difference = i16::from(left[index]) - borrow - i16::from(right[index]);
        if difference < 0 {
            result[index] = (difference + 10) as u8;
            borrow = 1;
        } else {
            result[index] = difference as u8;
            borrow = 0;
        }
    }
    result
}

fn render_decimal(mut digits: Vec<u8>, mut scale: usize, negative: bool) -> String {
    while scale > 0 && digits.last() == Some(&0) {
        digits.pop();
        scale -= 1;
    }
    let first_significant = digits
        .iter()
        .position(|digit| *digit != 0)
        .unwrap_or(digits.len().saturating_sub(1));
    digits.drain(..first_significant);
    if digits.iter().all(|digit| *digit == 0) {
        return "0".to_owned();
    }
    if digits.len() <= scale {
        digits = left_pad(digits, scale + 1);
    }
    let decimal_index = digits.len() - scale;
    let mut rendered = String::with_capacity(digits.len() + 2);
    if negative {
        rendered.push('-');
    }
    for (index, digit) in digits.into_iter().enumerate() {
        if scale > 0 && index == decimal_index {
            rendered.push('.');
        }
        rendered.push(char::from(b'0' + digit));
    }
    rendered
}

fn checked_expression_integer(
    value: Option<i128>,
    operation: &'static str,
) -> Result<ExactValue, ExpressionEvaluationError> {
    let value = value.ok_or(ExpressionEvaluationError::IntegerOverflow(operation))?;
    ExactInteger::parse(value.to_string())
        .map(ExactValue::Integer)
        .map_err(|_| ExpressionEvaluationError::IntegerOverflow(operation))
}
