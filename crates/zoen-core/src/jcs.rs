//! RFC 8785 JSON Canonicalization Scheme without external crates.
//!
//! Object keys sort by UTF-16 code units. Numbers use ES6 `NumberToString`.
//! Duplicate keys and non-finite numbers are rejected. This module does not
//! hash; SHA-256 of the returned UTF-8 bytes is computed by callers so
//! `zoen-core` stays dependency-free.

use std::cmp::Ordering;
use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JcsError {
    DuplicateKey,
    EmptyDocument,
    InvalidEscape,
    InvalidNumber,
    InvalidUtf8,
    NonFiniteNumber,
    TrailingJunk,
    UnexpectedEnd,
    UnexpectedToken,
}

impl Display for JcsError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateKey => formatter.write_str("duplicate object key"),
            Self::EmptyDocument => formatter.write_str("empty JSON document"),
            Self::InvalidEscape => formatter.write_str("invalid JSON string escape"),
            Self::InvalidNumber => formatter.write_str("invalid JSON number"),
            Self::InvalidUtf8 => formatter.write_str("JSON is not valid UTF-8"),
            Self::NonFiniteNumber => formatter.write_str("non-finite JSON number"),
            Self::TrailingJunk => formatter.write_str("trailing JSON after one value"),
            Self::UnexpectedEnd => formatter.write_str("unexpected end of JSON"),
            Self::UnexpectedToken => formatter.write_str("unexpected JSON token"),
        }
    }
}

impl Error for JcsError {}

#[derive(Clone, Debug, PartialEq)]
enum JsonValue {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<JsonValue>),
    Object(Vec<(String, JsonValue)>),
}

/// Canonicalize UTF-8 JSON bytes per RFC 8785 as implemented by Zoen.
pub fn canonicalize_json(input: &str) -> Result<String, JcsError> {
    canonicalize_json_bytes(input.as_bytes())
}

/// Canonicalize JSON bytes. Rejects invalid UTF-8 before parsing.
pub fn canonicalize_json_bytes(input: &[u8]) -> Result<String, JcsError> {
    let text = std::str::from_utf8(input).map_err(|_| JcsError::InvalidUtf8)?;
    if text.trim().is_empty() {
        return Err(JcsError::EmptyDocument);
    }
    let mut parser = Parser {
        input: text.as_bytes(),
        index: 0,
    };
    let value = parser.parse_value()?;
    parser.skip_ws();
    if parser.index != parser.input.len() {
        return Err(JcsError::TrailingJunk);
    }
    let mut out = String::new();
    write_value(&value, &mut out)?;
    Ok(out)
}

/// Lowercase hex SHA-256 encoding law. Digest computation lives in engine/TS.
pub fn is_canonical_digest_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

struct Parser<'a> {
    input: &'a [u8],
    index: usize,
}

impl Parser<'_> {
    fn skip_ws(&mut self) {
        while let Some(byte) = self.input.get(self.index) {
            if !matches!(byte, b' ' | b'\n' | b'\r' | b'\t') {
                break;
            }
            self.index += 1;
        }
    }

    fn peek(&self) -> Result<u8, JcsError> {
        self.input
            .get(self.index)
            .copied()
            .ok_or(JcsError::UnexpectedEnd)
    }

    fn bump(&mut self) -> Result<u8, JcsError> {
        let byte = self.peek()?;
        self.index += 1;
        Ok(byte)
    }

    fn parse_value(&mut self) -> Result<JsonValue, JcsError> {
        self.skip_ws();
        match self.peek()? {
            b'n' => self.parse_literal(b"null", JsonValue::Null),
            b't' => self.parse_literal(b"true", JsonValue::Bool(true)),
            b'f' => self.parse_literal(b"false", JsonValue::Bool(false)),
            b'"' => Ok(JsonValue::String(self.parse_string()?)),
            b'[' => self.parse_array(),
            b'{' => self.parse_object(),
            b'-' | b'0'..=b'9' => self.parse_number(),
            _ => Err(JcsError::UnexpectedToken),
        }
    }

    fn parse_literal(&mut self, expected: &[u8], value: JsonValue) -> Result<JsonValue, JcsError> {
        for byte in expected {
            if self.bump()? != *byte {
                return Err(JcsError::UnexpectedToken);
            }
        }
        Ok(value)
    }

    fn parse_array(&mut self) -> Result<JsonValue, JcsError> {
        self.bump()?;
        self.skip_ws();
        let mut items = Vec::new();
        if self.peek()? == b']' {
            self.bump()?;
            return Ok(JsonValue::Array(items));
        }
        loop {
            items.push(self.parse_value()?);
            self.skip_ws();
            match self.bump()? {
                b']' => return Ok(JsonValue::Array(items)),
                b',' => {}
                _ => return Err(JcsError::UnexpectedToken),
            }
        }
    }

    fn parse_object(&mut self) -> Result<JsonValue, JcsError> {
        self.bump()?;
        self.skip_ws();
        let mut members = Vec::new();
        if self.peek()? == b'}' {
            self.bump()?;
            return Ok(JsonValue::Object(members));
        }
        loop {
            self.skip_ws();
            if self.peek()? != b'"' {
                return Err(JcsError::UnexpectedToken);
            }
            let key = self.parse_string()?;
            if members.iter().any(|(existing, _)| existing == &key) {
                return Err(JcsError::DuplicateKey);
            }
            self.skip_ws();
            if self.bump()? != b':' {
                return Err(JcsError::UnexpectedToken);
            }
            let value = self.parse_value()?;
            members.push((key, value));
            self.skip_ws();
            match self.bump()? {
                b'}' => {
                    members.sort_by(|(left, _), (right, _)| compare_utf16(left, right));
                    return Ok(JsonValue::Object(members));
                }
                b',' => {}
                _ => return Err(JcsError::UnexpectedToken),
            }
        }
    }

    fn parse_string(&mut self) -> Result<String, JcsError> {
        if self.bump()? != b'"' {
            return Err(JcsError::UnexpectedToken);
        }
        let mut out = String::new();
        loop {
            match self.bump()? {
                b'"' => return Ok(out),
                b'\\' => out.push(self.parse_escape()?),
                byte if byte < 0x20 => return Err(JcsError::InvalidEscape),
                _byte => {
                    self.index -= 1;
                    let rest = &self.input[self.index..];
                    let text = std::str::from_utf8(rest).map_err(|_| JcsError::InvalidUtf8)?;
                    let ch = text.chars().next().ok_or(JcsError::UnexpectedEnd)?;
                    if ch == '"' || ch == '\\' {
                        return Err(JcsError::UnexpectedToken);
                    }
                    out.push(ch);
                    self.index += ch.len_utf8();
                }
            }
        }
    }

    fn parse_escape(&mut self) -> Result<char, JcsError> {
        match self.bump()? {
            b'"' => Ok('"'),
            b'\\' => Ok('\\'),
            b'/' => Ok('/'),
            b'b' => Ok('\u{0008}'),
            b'f' => Ok('\u{000c}'),
            b'n' => Ok('\n'),
            b'r' => Ok('\r'),
            b't' => Ok('\t'),
            b'u' => self.parse_unicode_escape(),
            _ => Err(JcsError::InvalidEscape),
        }
    }

    fn parse_unicode_escape(&mut self) -> Result<char, JcsError> {
        let unit = self.parse_hex4()?;
        if (0xd800..=0xdbff).contains(&unit) {
            if self.input.get(self.index..self.index + 2) != Some(b"\\u") {
                return Err(JcsError::InvalidEscape);
            }
            self.index += 2;
            let low = self.parse_hex4()?;
            if !(0xdc00..=0xdfff).contains(&low) {
                return Err(JcsError::InvalidEscape);
            }
            let code = 0x10000 + (((unit as u32) - 0xd800) << 10) + ((low as u32) - 0xdc00);
            return char::from_u32(code).ok_or(JcsError::InvalidEscape);
        }
        if (0xdc00..=0xdfff).contains(&unit) {
            return Err(JcsError::InvalidEscape);
        }
        char::from_u32(u32::from(unit)).ok_or(JcsError::InvalidEscape)
    }

    fn parse_hex4(&mut self) -> Result<u16, JcsError> {
        let mut value = 0u16;
        for _ in 0..4 {
            let byte = self.bump()?;
            value = (value << 4)
                | match byte {
                    b'0'..=b'9' => u16::from(byte - b'0'),
                    b'a'..=b'f' => u16::from(byte - b'a' + 10),
                    b'A'..=b'F' => u16::from(byte - b'A' + 10),
                    _ => return Err(JcsError::InvalidEscape),
                };
        }
        Ok(value)
    }

    fn parse_number(&mut self) -> Result<JsonValue, JcsError> {
        let start = self.index;
        if self.peek()? == b'-' {
            self.bump()?;
        }
        match self.peek()? {
            b'0' => {
                self.bump()?;
            }
            b'1'..=b'9' => {
                while matches!(self.input.get(self.index), Some(b'0'..=b'9')) {
                    self.index += 1;
                }
            }
            _ => return Err(JcsError::InvalidNumber),
        }
        if self.input.get(self.index) == Some(&b'.') {
            self.index += 1;
            if !matches!(self.input.get(self.index), Some(b'0'..=b'9')) {
                return Err(JcsError::InvalidNumber);
            }
            while matches!(self.input.get(self.index), Some(b'0'..=b'9')) {
                self.index += 1;
            }
        }
        if matches!(self.input.get(self.index), Some(b'e' | b'E')) {
            self.index += 1;
            if matches!(self.input.get(self.index), Some(b'+' | b'-')) {
                self.index += 1;
            }
            if !matches!(self.input.get(self.index), Some(b'0'..=b'9')) {
                return Err(JcsError::InvalidNumber);
            }
            while matches!(self.input.get(self.index), Some(b'0'..=b'9')) {
                self.index += 1;
            }
        }
        let raw = std::str::from_utf8(&self.input[start..self.index])
            .map_err(|_| JcsError::InvalidNumber)?;
        let number: f64 = raw.parse().map_err(|_| JcsError::InvalidNumber)?;
        if !number.is_finite() {
            return Err(JcsError::NonFiniteNumber);
        }
        Ok(JsonValue::Number(number))
    }
}

fn compare_utf16(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

fn write_value(value: &JsonValue, out: &mut String) -> Result<(), JcsError> {
    match value {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(true) => out.push_str("true"),
        JsonValue::Bool(false) => out.push_str("false"),
        JsonValue::Number(number) => out.push_str(&es6_number(*number)?),
        JsonValue::String(text) => write_string(text, out),
        JsonValue::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_value(item, out)?;
            }
            out.push(']');
        }
        JsonValue::Object(members) => {
            out.push('{');
            for (index, (key, item)) in members.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_string(key, out);
                out.push(':');
                write_value(item, out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

fn write_string(text: &str, out: &mut String) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ch if (ch as u32) < 0x20 => {
                let code = ch as u32;
                out.push_str(&format!("\\u{code:04x}"));
            }
            ch => out.push(ch),
        }
    }
    out.push('"');
}

fn es6_number(value: f64) -> Result<String, JcsError> {
    if !value.is_finite() {
        return Err(JcsError::NonFiniteNumber);
    }
    if value == 0.0 {
        return Ok("0".to_owned());
    }
    let negative = value.is_sign_negative();
    let abs = value.abs();
    let sci = format!("{abs:e}");
    let (digits, rust_exp) = parse_rust_scientific(&sci)?;
    let k = i32::try_from(digits.len()).map_err(|_| JcsError::InvalidNumber)?;
    let n = rust_exp + 1;
    let mut body = String::new();
    if (1..=21).contains(&n) && k <= n {
        body.push_str(&digits);
        for _ in 0..(n - k) {
            body.push('0');
        }
    } else if (1..=21).contains(&n) {
        body.push_str(&digits[..n as usize]);
        body.push('.');
        body.push_str(&digits[n as usize..]);
    } else if (-6..1).contains(&n) {
        body.push_str("0.");
        for _ in 0..(-n) {
            body.push('0');
        }
        body.push_str(&digits);
    } else {
        body.push(digits.as_bytes()[0] as char);
        if digits.len() > 1 {
            body.push('.');
            body.push_str(&digits[1..]);
        }
        body.push('e');
        let exp = n - 1;
        if exp >= 0 {
            body.push('+');
        }
        body.push_str(&exp.to_string());
    }
    if negative {
        Ok(format!("-{body}"))
    } else {
        Ok(body)
    }
}

fn parse_rust_scientific(sci: &str) -> Result<(String, i32), JcsError> {
    let (mantissa, exp_text) = sci.split_once('e').ok_or(JcsError::InvalidNumber)?;
    let rust_exp: i32 = exp_text.parse().map_err(|_| JcsError::InvalidNumber)?;
    let mut digits = String::new();
    for ch in mantissa.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
        } else if ch != '.' {
            return Err(JcsError::InvalidNumber);
        }
    }
    if digits.is_empty() {
        return Err(JcsError::InvalidNumber);
    }
    Ok((digits, rust_exp))
}

#[cfg(test)]
mod tests {
    use super::{JcsError, canonicalize_json, canonicalize_json_bytes, is_canonical_digest_hex};
    use std::fs;
    use std::path::PathBuf;

    fn testdata() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../testdata/jcs")
    }

    fn read(path: PathBuf) -> Vec<u8> {
        fs::read(path).expect("fixture")
    }

    fn cases(dir: &str) -> Vec<String> {
        let root = testdata().join(dir);
        let mut names = Vec::new();
        for entry in fs::read_dir(root).expect("testdata") {
            let entry = entry.expect("entry");
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if let Some(stem) = name.strip_suffix(".json") {
                names.push(stem.to_owned());
            }
        }
        names.sort();
        names
    }

    #[test]
    fn rfc8785_and_zoen_vectors_are_bit_perfect() {
        for dir in ["rfc8785", "zoen"] {
            for name in cases(dir) {
                let input = testdata().join(dir).join(format!("{name}.json"));
                let expected = testdata().join(dir).join(format!("{name}.jcs"));
                let digest = testdata().join(dir).join(format!("{name}.sha256"));
                let actual = canonicalize_json_bytes(&read(input)).expect(&name);
                let expected = String::from_utf8(read(expected)).expect("utf8");
                assert_eq!(actual, expected, "{dir}/{name}");
                let hex = fs::read_to_string(digest)
                    .expect("digest")
                    .trim()
                    .to_owned();
                assert!(
                    is_canonical_digest_hex(&hex),
                    "{dir}/{name} digest encoding"
                );
            }
        }
    }

    #[test]
    fn duplicate_keys_and_trailing_junk_are_rejected() {
        let duplicate = testdata().join("errors/duplicate-keys.json");
        assert_eq!(
            canonicalize_json_bytes(&read(duplicate)),
            Err(JcsError::DuplicateKey)
        );
        let junk = testdata().join("errors/trailing-junk.json");
        assert_eq!(
            canonicalize_json_bytes(&read(junk)),
            Err(JcsError::TrailingJunk)
        );
    }

    #[test]
    fn invalid_utf8_is_rejected() {
        assert_eq!(
            canonicalize_json_bytes(&[0x7b, 0xff, 0x7d]),
            Err(JcsError::InvalidUtf8)
        );
    }

    #[test]
    fn digest_hex_is_lowercase_64() {
        assert!(is_canonical_digest_hex(
            "3007ba96dbc428d28d4791b10e2e35e6a42166cbcfa8643623dc7cd5e0b82037"
        ));
        assert!(!is_canonical_digest_hex(
            "3007BA96DBC428D28D4791B10E2E35E6A42166CBCFA8643623DC7CD5E0B82037"
        ));
        assert!(!is_canonical_digest_hex("abc"));
    }

    #[test]
    fn omitted_field_is_not_null() {
        let omitted = canonicalize_json("{\"keep\":1}").expect("omit");
        let present_null = canonicalize_json("{\"keep\":1,\"gone\":null}").expect("null");
        assert_eq!(omitted, "{\"keep\":1}");
        assert_ne!(omitted, present_null);
    }
}
