import assert from "node:assert/strict";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import {
  extractPdfMarkdown,
  type ConvertError,
} from "./extraction.js";
import {
  CompanyBrain,
  IngestFailure,
} from "./knowledge.js";
import { AgentRegistry } from "./registry.js";
import { modelCapabilityAliasSchema } from "./types.js";

test("PDF extraction detects the format from bytes", async () => {
  await assert.rejects(
    extractPdfMarkdown(new TextEncoder().encode("not a PDF")),
    (error: unknown) =>
      isConvertError(error) &&
      error.code === "unsupported" &&
      error.message.includes("PDF signature"),
  );
});

test("image-only PDFs fail closed as unsupported", async () => {
  await assert.rejects(
    extractPdfMarkdown(imageOnlyPdf()),
    (error: unknown) => isConvertError(error) && error.code === "unsupported",
  );
});

test("invalid ingest input has a typed corrupt-source failure", async () => {
  const pool = new Pool();
  const brain = new CompanyBrain({
    bucket: "unused",
    embeddingCapability: modelCapabilityAliasSchema.parse("embedding-default"),
    pool,
    registry: new AgentRegistry(),
    s3: new S3Client({
      credentials: {
        accessKeyId: "unused",
        secretAccessKey: "unused",
      },
      region: "us-east-1",
    }),
  });
  try {
    await assert.rejects(
      brain.ingest("tenant.a", { kind: "pdf" }),
      (error: unknown) =>
        error instanceof IngestFailure && error.code === "corrupt_source",
    );
  } finally {
    await pool.end();
  }
});

function isConvertError(error: unknown): error is ConvertError {
  return error instanceof Error && "code" in error;
}

function imageOnlyPdf(): Uint8Array {
  const image = "A";
  const commands = "q 100 0 0 100 0 0 cm /Image0 Do Q\n";
  return pdfDocument([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /Image0 4 0 R >> >> /Contents 5 0 R >>",
    `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${Buffer.byteLength(image)} >>\nstream\n${image}\nendstream`,
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}endstream`,
  ]);
}

function pdfDocument(objects: readonly string[]): Uint8Array {
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n`;
  document += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  document += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(document);
}
