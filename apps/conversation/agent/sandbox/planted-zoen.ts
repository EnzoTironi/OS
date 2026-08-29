import type { HostCredential } from "./credentials";

export const ISOLATE_COMMIT_DENY = "isolate cannot commit";
export const ISOLATE_SPEAK_DENY = "isolate cannot speak";

export type PlantedZoenResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type ParsedZoen =
  | { readonly kind: "world-query"; readonly typeId: string; readonly limit: number }
  | { readonly kind: "denied-commit" }
  | { readonly kind: "denied-speak" }
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string };

export function isZoenArgv(argv: readonly string[]): boolean {
  const first = argv[0];
  if (first === undefined) {
    return false;
  }
  if (first === "zoen") {
    return true;
  }
  return first === "/workspace/bin/zoen" || first.endsWith("/bin/zoen");
}

export function parseZoenArgv(argv: readonly string[]): ParsedZoen {
  const rest = isZoenArgv(argv) ? argv.slice(1) : argv;
  if (rest.length === 0 || rest[0] === "help" || rest[0] === "--help") {
    return { kind: "help" };
  }
  const noun = rest[0];
  const verb = rest[1];
  if (noun === "speak" || noun === "say" || verb === "speak") {
    return { kind: "denied-speak" };
  }
  if (noun === "action" && verb === "commit") {
    return { kind: "denied-commit" };
  }
  if (noun === "commit") {
    return { kind: "denied-commit" };
  }
  if (noun === "world" && verb === "query") {
    let typeId = "";
    let limit = 10;
    for (let i = 2; i < rest.length; i += 1) {
      const flag = rest[i];
      const value = rest[i + 1];
      if (flag === "--type" && value !== undefined) {
        typeId = value;
        i += 1;
      } else if (flag === "--limit" && value !== undefined) {
        limit = Number(value);
        i += 1;
      }
    }
    if (typeId.length === 0) {
      return { kind: "invalid", message: "zoen world query requires --type" };
    }
    return { kind: "world-query", typeId, limit };
  }
  return { kind: "invalid", message: `unknown zoen verb: ${rest.join(" ")}` };
}

export async function runPlantedZoen(input: {
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential | undefined;
  readonly argv: readonly string[];
}): Promise<PlantedZoenResult> {
  const parsed = parseZoenArgv(input.argv);
  if (parsed.kind === "denied-commit") {
    return { exitCode: 1, stdout: "", stderr: `${ISOLATE_COMMIT_DENY}\n` };
  }
  if (parsed.kind === "denied-speak") {
    return { exitCode: 1, stdout: "", stderr: `${ISOLATE_SPEAK_DENY}\n` };
  }
  if (parsed.kind === "help") {
    return {
      exitCode: 0,
      stdout: "zoen world query --type TYPE\n",
      stderr: "",
    };
  }
  if (parsed.kind === "invalid") {
    return { exitCode: 2, stdout: "", stderr: `${parsed.message}\n` };
  }
  if (input.credential === undefined) {
    return { exitCode: 1, stdout: "", stderr: "precisa de membership\n" };
  }
  return semanticQuery({
    zoendBaseUrl: input.zoendBaseUrl,
    credential: input.credential,
    typeId: parsed.typeId,
    limit: parsed.limit,
  });
}

async function semanticQuery(input: {
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential;
  readonly typeId: string;
  readonly limit: number;
}): Promise<PlantedZoenResult> {
  const url = `${input.zoendBaseUrl.replace(/\/+$/u, "")}/zoen.world.v1.WorldService/SemanticQuery`;
  const body = JSON.stringify({
    tenantId: input.credential.tenantId,
    definition: {
      definitionId: input.credential.definitionId,
      revision: "1",
      digest: input.credential.definitionDigest,
    },
    validAt: input.credential.validAt,
    consistency: { strong: {} },
    byType: { typeId: input.typeId, limit: input.limit },
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.credential.doorToken}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `zoend SemanticQuery ${response.status} ${text}\n`,
    };
  }
  return { exitCode: 0, stdout: `${text}\n`, stderr: "" };
}

export function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/u).filter((part) => part.length > 0);
}
