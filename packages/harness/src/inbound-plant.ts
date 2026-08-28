import { readFile } from "node:fs/promises";
import { inboundDocumentPath } from "./anydoc-cli.js";
import type { ExecutionWorkbench } from "./execution.js";

export interface IsolateInboundMedia {
  readonly blobs: Readonly<Record<string, Uint8Array>>;
  readonly files: Readonly<Record<string, string>>;
}

export interface CompanionDocumentRef {
  readonly filename: string;
  readonly mediaRef: string;
}

/**
 * Map companion media bytes onto isolate `inbound/<basename>`.
 *
 * Context: WhatsApp mediaRef is a host path. vfs-guard denies `anydoc /tmp/…`.
 * Inputs: host filename/mediaRef plus the admitted bytes.
 * Outputs: `files` for CSV text, `blobs` for office/PDF.
 * Side effects: none.
 */
export function isolateInboundFromMedia(input: {
  readonly bytes: Uint8Array;
  readonly filename?: string;
  readonly mediaRef: string;
}): IsolateInboundMedia {
  const relative = inboundDocumentPath(input.filename ?? input.mediaRef);
  if (relative.toLowerCase().endsWith(".csv")) {
    return {
      blobs: {},
      files: { [relative]: new TextDecoder().decode(input.bytes) },
    };
  }
  return { blobs: { [relative]: input.bytes }, files: {} };
}

/**
 * Copy host mediaRef bytes onto an existing workbench isolate.
 *
 * Context: serve creates one workbench, then inbound documents arrive.
 * Inputs: workbench plus companion filename/mediaRef.
 * Outputs: isolate relative path (`inbound/quote.xlsx`).
 * Side effects: reads the host path; writes isolate inbound.
 */
export async function plantHostMediaOnWorkbench(
  workbench: ExecutionWorkbench,
  input: CompanionDocumentRef,
  read: (path: string) => Promise<Uint8Array> = (path) => readFile(path),
): Promise<string> {
  const planted = isolateInboundFromMedia({
    bytes: await read(input.mediaRef),
    filename: input.filename,
    mediaRef: input.mediaRef,
  });
  await workbench.plantInbound(planted);
  return inboundDocumentPath(input.filename);
}
