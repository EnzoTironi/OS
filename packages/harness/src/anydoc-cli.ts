import {
  formatFromBytes,
  formatFromExtension,
  formatFromPath,
  toMarkdownBytes,
  type Format,
  type NeedsOcrError,
} from "@firecrawl/anydoc";
import { defineCommand, type ResolvedCommandContext } from "just-bash";

export const ANYDOC_CLI_RELATIVE_PATH = "bin/anydoc";
export const INBOUND_DOCUMENT_DIR = "inbound";
export const ANYDOC_NEEDS_OCR_EXIT = 3;
export const ANYDOC_USAGE_EXIT = 2;
export const ANYDOC_CONVERT_EXIT = 1;

export const ANYDOC_CLI_SCRIPT = [
  "#!/usr/bin/env bash",
  "# Planted AnyDoc isolate CLI. Office/PDF/CSV to markdown.",
  "# Hosted Firecrawl OCR is out of Zoen. NeedsOcr fails openly.",
  "set -euo pipefail",
  'exec anydoc "$@"',
  "",
].join("\n");

export const ANYDOC_CLI_USAGE = [
  "anydoc <file>",
  "anydoc <file> -o <out.md>",
  "anydoc <file> --format csv",
  "Scanned PDF pages fail as NeedsOcr with named pages.",
  "Hosted Firecrawl OCR is out of Zoen.",
].join("\n");

export interface AnydocCliProcessResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

type ParsedAnydocArgs =
  | { readonly kind: "convert"; readonly format?: string; readonly input: string; readonly output?: string }
  | { readonly kind: "help" }
  | { readonly kind: "hosted_ocr" }
  | { readonly kind: "invalid"; readonly message: string };

/**
 * Relative isolate path for a dropped inbound document.
 *
 * Context: WhatsApp mediaRef is a host path; the workbench VFS is the isolate.
 * Inputs: filename or path from companion/media.
 * Outputs: `inbound/<basename>`.
 * Side effects: none.
 */
export function inboundDocumentPath(filename: string): string {
  const parts = filename.split("/");
  return `${INBOUND_DOCUMENT_DIR}/${parts[parts.length - 1] ?? filename}`;
}

export function anydocCliBashInstructions(): string {
  return [
    "A planted anydoc CLI at bin/anydoc converts Word/Excel/PowerPoint/ODT/CSV/PDF to markdown.",
    "Use anydoc <file>. Scanned pages fail as NeedsOcr with named pages.",
    "Hosted Firecrawl OCR is out of Zoen.",
  ].join(" ");
}

export function createAnydocCliCommand() {
  return defineCommand("anydoc", async (args, ctx) => runAnydocCli(args, ctx));
}

/**
 * Dispatch planted `anydoc` against isolate VFS bytes.
 *
 * Context: same capability plane as `zoen query|propose`. Never hosted OCR.
 * Inputs: argv after `anydoc`, isolate fs/cwd.
 * Outputs: markdown on stdout, or NeedsOcr with named pages on stderr.
 * Side effects: optional `-o` write on the isolate VFS.
 */
export async function runAnydocCli(
  args: readonly string[],
  ctx: Pick<ResolvedCommandContext, "cwd" | "fs">,
): Promise<AnydocCliProcessResult> {
  const parsed = parseAnydocArgs(args);
  switch (parsed.kind) {
    case "convert":
      return convertDocument(parsed, ctx);
    case "help":
      return { exitCode: 0, stderr: "", stdout: `${ANYDOC_CLI_USAGE}\n` };
    case "hosted_ocr":
      return {
        exitCode: ANYDOC_USAGE_EXIT,
        stderr: "anydoc: hosted OCR is out of Zoen; NeedsOcr fails openly\n",
        stdout: "",
      };
    case "invalid":
      return {
        exitCode: ANYDOC_USAGE_EXIT,
        stderr: `anydoc: ${parsed.message}\n`,
        stdout: "",
      };
    default: {
      const exhaustive: never = parsed;
      return exhaustive;
    }
  }
}

function parseAnydocArgs(args: readonly string[]): ParsedAnydocArgs {
  let format: string | undefined;
  let input: string | undefined;
  let output: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      continue;
    }
    if (token === "-h" || token === "--help") {
      return { kind: "help" };
    }
    if (token === "-o" || token === "--output") {
      output = args[index + 1];
      index += 1;
      continue;
    }
    if (token === "-f" || token === "--format") {
      format = args[index + 1];
      index += 1;
      continue;
    }
    if (token === "--ocr") {
      const mode = args[index + 1];
      index += 1;
      if (mode === "hosted") {
        return { kind: "hosted_ocr" };
      }
      if (mode !== "reject") {
        return { kind: "invalid", message: `invalid --ocr '${mode ?? ""}'` };
      }
      continue;
    }
    if (token.startsWith("-")) {
      return { kind: "invalid", message: `unknown option '${token}'` };
    }
    if (input !== undefined) {
      return { kind: "invalid", message: "one document per invocation" };
    }
    input = token;
  }
  if (input === undefined) {
    return { kind: "invalid", message: "missing input" };
  }
  return { format, input, kind: "convert", output };
}

async function convertDocument(
  parsed: Extract<ParsedAnydocArgs, { kind: "convert" }>,
  ctx: Pick<ResolvedCommandContext, "cwd" | "fs">,
): Promise<AnydocCliProcessResult> {
  const inputPath = ctx.fs.resolvePath(ctx.cwd, parsed.input);
  let bytes: Uint8Array;
  try {
    bytes = await ctx.fs.readFileBuffer(inputPath);
  } catch (error: unknown) {
    return convertFail(error);
  }
  const format = resolveFormat(parsed.format, parsed.input, bytes);
  if (format === undefined) {
    return {
      exitCode: ANYDOC_CONVERT_EXIT,
      stderr: "anydoc: unsupported document format\n",
      stdout: "",
    };
  }
  try {
    const markdown = await toMarkdownBytes(bytes, format);
    if (parsed.output === undefined) {
      return { exitCode: 0, stderr: "", stdout: markdown };
    }
    await ctx.fs.writeFile(ctx.fs.resolvePath(ctx.cwd, parsed.output), markdown);
    return { exitCode: 0, stderr: "", stdout: "" };
  } catch (error: unknown) {
    return convertFail(error);
  }
}

function resolveFormat(
  named: string | undefined,
  input: string,
  bytes: Uint8Array,
): Format | undefined {
  if (named !== undefined) {
    return formatFromExtension(named) ?? undefined;
  }
  return formatFromPath(input) ?? formatFromBytes(bytes) ?? undefined;
}

function convertFail(error: unknown): AnydocCliProcessResult {
  if (isNeedsOcrError(error)) {
    return {
      exitCode: ANYDOC_NEEDS_OCR_EXIT,
      stderr: `anydoc: NeedsOcr pages ${error.pages.join(", ")}\n`,
      stdout: "",
    };
  }
  const message = error instanceof Error ? error.message : "conversion failed";
  return {
    exitCode: ANYDOC_CONVERT_EXIT,
    stderr: `anydoc: ${message}\n`,
    stdout: "",
  };
}

function isNeedsOcrError(error: unknown): error is NeedsOcrError {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "needsOcr" &&
    "pages" in error &&
    Array.isArray(error.pages)
  );
}
