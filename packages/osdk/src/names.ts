const reservedNames = new Set([
  "any",
  "as",
  "async",
  "await",
  "bigint",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "infer",
  "instanceof",
  "interface",
  "keyof",
  "let",
  "never",
  "new",
  "null",
  "number",
  "object",
  "of",
  "package",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "static",
  "string",
  "super",
  "switch",
  "symbol",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "unique",
  "unknown",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/**
 * Maps a definition id such as `commercial.OrderLine` to the caller-facing
 * API name `OrderLine`.
 */
export function apiNameFromId(id: string): string {
  const segments = id.split(".");
  const last = segments[segments.length - 1];
  if (last === undefined || last.length === 0) {
    throw new Error(`definition id has no API name: ${id}`);
  }
  const normalized = last.replaceAll("-", "_");
  if (reservedNames.has(normalized)) {
    return `$${normalized}`;
  }
  return normalized;
}

export function isTsIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !reservedNames.has(name);
}

export function emitPropertyName(name: string): string {
  return isTsIdentifier(name) ? name : JSON.stringify(name);
}

export function assertUniqueApiNames(
  ids: readonly string[],
  kind: string,
): ReadonlyMap<string, string> {
  const apiToId = new Map<string, string>();
  for (const id of ids) {
    const apiName = apiNameFromId(id);
    const existing = apiToId.get(apiName);
    if (existing !== undefined && existing !== id) {
      throw new Error(
        `duplicate ${kind} API name ${apiName} from ${existing} and ${id}`,
      );
    }
    apiToId.set(apiName, id);
  }
  return apiToId;
}
