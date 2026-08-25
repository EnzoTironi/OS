import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type JcsErrorKind =
  | "duplicate_key"
  | "empty_document"
  | "invalid_escape"
  | "invalid_number"
  | "invalid_utf8"
  | "non_finite_number"
  | "trailing_junk"
  | "unexpected_end"
  | "unexpected_token";

export class JcsError extends Error {
  readonly kind: JcsErrorKind;

  constructor(kind: JcsErrorKind, message: string) {
    super(message);
    this.name = "JcsError";
    this.kind = kind;
  }
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * RFC 8785 JCS matching zoen-core / serde_jcs / canonicalize 4.x.
 * Rejects duplicate keys. Does not hash.
 */
export function canonicalizeJson(input: string): string {
  return canonicalizeJsonBytes(Buffer.from(input, "utf8"));
}

export function canonicalizeJsonBytes(input: Uint8Array): string {
  const decoded = decodeUtf8(input);
  if (decoded.trim().length === 0) {
    throw new JcsError("empty_document", "empty JSON document");
  }
  const parser = new Parser(decoded);
  const value = parser.parseValue();
  parser.skipWs();
  if (parser.index !== decoded.length) {
    throw new JcsError("trailing_junk", "trailing JSON after one value");
  }
  return writeValue(value);
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isCanonicalDigestHex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function jcsTestdataRoot(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, "testdata", "jcs");
}

export function listJcsSuccessCases(
  group: "rfc8785" | "zoen",
  cwd: string = process.cwd(),
): readonly string[] {
  const dir = path.join(jcsTestdataRoot(cwd), group);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .sort();
}

export function readJcsFixture(
  group: "rfc8785" | "zoen" | "errors",
  name: string,
  ext: "json" | "jcs" | "sha256" | "error",
  cwd: string = process.cwd(),
): Buffer {
  return readFileSync(path.join(jcsTestdataRoot(cwd), group, `${name}.${ext}`));
}

function decodeUtf8(input: Uint8Array): string {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    return decoder.decode(input);
  } catch {
    throw new JcsError("invalid_utf8", "JSON is not valid UTF-8");
  }
}

class Parser {
  index = 0;

  constructor(private readonly input: string) {}

  skipWs(): void {
    while (this.index < this.input.length) {
      const ch = this.input[this.index];
      if (ch !== " " && ch !== "\n" && ch !== "\r" && ch !== "\t") {
        break;
      }
      this.index += 1;
    }
  }

  peek(): string {
    const ch = this.input[this.index];
    if (ch === undefined) {
      throw new JcsError("unexpected_end", "unexpected end of JSON");
    }
    return ch;
  }

  bump(): string {
    const ch = this.peek();
    this.index += 1;
    return ch;
  }

  parseValue(): JsonValue {
    this.skipWs();
    const ch = this.peek();
    if (ch === "n") {
      return this.parseLiteral("null", null);
    }
    if (ch === "t") {
      return this.parseLiteral("true", true);
    }
    if (ch === "f") {
      return this.parseLiteral("false", false);
    }
    if (ch === '"') {
      return this.parseString();
    }
    if (ch === "[") {
      return this.parseArray();
    }
    if (ch === "{") {
      return this.parseObject();
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      return this.parseNumber();
    }
    throw new JcsError("unexpected_token", "unexpected JSON token");
  }

  parseLiteral<T extends JsonValue>(expected: string, value: T): T {
    for (const byte of expected) {
      if (this.bump() !== byte) {
        throw new JcsError("unexpected_token", "unexpected JSON token");
      }
    }
    return value;
  }

  parseArray(): JsonValue[] {
    this.bump();
    this.skipWs();
    const items: JsonValue[] = [];
    if (this.peek() === "]") {
      this.bump();
      return items;
    }
    for (;;) {
      items.push(this.parseValue());
      this.skipWs();
      const next = this.bump();
      if (next === "]") {
        return items;
      }
      if (next !== ",") {
        throw new JcsError("unexpected_token", "unexpected JSON token");
      }
    }
  }

  parseObject(): { readonly [key: string]: JsonValue } {
    this.bump();
    this.skipWs();
    const members: Array<[string, JsonValue]> = [];
    if (this.peek() === "}") {
      this.bump();
      return {};
    }
    for (;;) {
      this.skipWs();
      if (this.peek() !== '"') {
        throw new JcsError("unexpected_token", "unexpected JSON token");
      }
      const key = this.parseString();
      if (members.some(([existing]) => existing === key)) {
        throw new JcsError("duplicate_key", `duplicate object key: ${key}`);
      }
      this.skipWs();
      if (this.bump() !== ":") {
        throw new JcsError("unexpected_token", "unexpected JSON token");
      }
      members.push([key, this.parseValue()]);
      this.skipWs();
      const next = this.bump();
      if (next === "}") {
        members.sort(([left], [right]) => compareUtf16(left, right));
        const object: Record<string, JsonValue> = {};
        for (const [memberKey, value] of members) {
          object[memberKey] = value;
        }
        return object;
      }
      if (next !== ",") {
        throw new JcsError("unexpected_token", "unexpected JSON token");
      }
    }
  }

  parseString(): string {
    if (this.bump() !== '"') {
      throw new JcsError("unexpected_token", "unexpected JSON token");
    }
    let out = "";
    for (;;) {
      const ch = this.bump();
      if (ch === '"') {
        return out;
      }
      if (ch === "\\") {
        out += this.parseEscape();
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) {
        throw new JcsError("invalid_escape", "unescaped control in string");
      }
      out += ch;
    }
  }

  parseEscape(): string {
    const ch = this.bump();
    switch (ch) {
      case '"':
      case "\\":
      case "/":
        return ch;
      case "b":
        return "\u0008";
      case "f":
        return "\u000c";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "u":
        return this.parseUnicodeEscape();
      default:
        throw new JcsError("invalid_escape", "invalid JSON string escape");
    }
  }

  parseUnicodeEscape(): string {
    const unit = this.parseHex4();
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (this.input.slice(this.index, this.index + 2) !== "\\u") {
        throw new JcsError("invalid_escape", "lone surrogate");
      }
      this.index += 2;
      const low = this.parseHex4();
      if (low < 0xdc00 || low > 0xdfff) {
        throw new JcsError("invalid_escape", "invalid surrogate pair");
      }
      const code = 0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00);
      return String.fromCodePoint(code);
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new JcsError("invalid_escape", "lone surrogate");
    }
    return String.fromCharCode(unit);
  }

  parseHex4(): number {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      const ch = this.bump();
      const code = ch.charCodeAt(0);
      if (code >= 48 && code <= 57) {
        value = (value << 4) | (code - 48);
      } else if (code >= 97 && code <= 102) {
        value = (value << 4) | (code - 87);
      } else if (code >= 65 && code <= 70) {
        value = (value << 4) | (code - 55);
      } else {
        throw new JcsError("invalid_escape", "invalid hex");
      }
    }
    return value;
  }

  parseNumber(): number {
    const start = this.index;
    if (this.peek() === "-") {
      this.index += 1;
    }
    const first = this.peek();
    if (first === "0") {
      this.index += 1;
    } else if (first >= "1" && first <= "9") {
      while (this.index < this.input.length) {
        const digit = this.input[this.index];
        if (digit === undefined || digit < "0" || digit > "9") {
          break;
        }
        this.index += 1;
      }
    } else {
      throw new JcsError("invalid_number", "invalid JSON number");
    }
    if (this.input[this.index] === ".") {
      this.index += 1;
      const frac = this.input[this.index];
      if (frac === undefined || frac < "0" || frac > "9") {
        throw new JcsError("invalid_number", "invalid JSON number");
      }
      while (this.index < this.input.length) {
        const digit = this.input[this.index];
        if (digit === undefined || digit < "0" || digit > "9") {
          break;
        }
        this.index += 1;
      }
    }
    const expMark = this.input[this.index];
    if (expMark === "e" || expMark === "E") {
      this.index += 1;
      const sign = this.input[this.index];
      if (sign === "+" || sign === "-") {
        this.index += 1;
      }
      const expDigit = this.input[this.index];
      if (expDigit === undefined || expDigit < "0" || expDigit > "9") {
        throw new JcsError("invalid_number", "invalid JSON number");
      }
      while (this.index < this.input.length) {
        const digit = this.input[this.index];
        if (digit === undefined || digit < "0" || digit > "9") {
          break;
        }
        this.index += 1;
      }
    }
    const raw = this.input.slice(start, this.index);
    const number = Number(raw);
    if (!Number.isFinite(number)) {
      throw new JcsError("non_finite_number", "non-finite JSON number");
    }
    return number;
  }
}

function compareUtf16(left: string, right: string): number {
  const leftUnits = utf16Units(left);
  const rightUnits = utf16Units(right);
  const len = Math.min(leftUnits.length, rightUnits.length);
  for (let i = 0; i < len; i += 1) {
    const l = leftUnits[i];
    const r = rightUnits[i];
    if (l === undefined || r === undefined || l === r) {
      continue;
    }
    return l < r ? -1 : 1;
  }
  return leftUnits.length - rightUnits.length;
}

function utf16Units(value: string): number[] {
  const units: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    units.push(value.charCodeAt(i));
  }
  return units;
}

function writeValue(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  if (typeof value === "number") {
    return es6Number(value);
  }
  if (typeof value === "string") {
    return writeString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => writeValue(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort(compareUtf16);
  const members = keys.map((key) => {
    const member = value[key];
    return `${writeString(key)}:${writeValue(member ?? null)}`;
  });
  return `{${members.join(",")}}`;
}

function writeString(text: string): string {
  let out = '"';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\u0008":
        out += "\\b";
        break;
      case "\u000c":
        out += "\\f";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        if (code < 0x20) {
          out += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          out += ch;
        }
    }
  }
  return `${out}"`;
}

function es6Number(value: number): string {
  if (!Number.isFinite(value)) {
    throw new JcsError("non_finite_number", "non-finite JSON number");
  }
  if (value === 0) {
    return "0";
  }
  return value.toString();
}
