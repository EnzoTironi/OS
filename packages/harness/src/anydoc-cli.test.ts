process.env.ZOEN_ALLOW_JS_SANDBOX = "1";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { join } from "node:path";
import test from "node:test";
import { MockLanguageModelV3 } from "ai/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  ANYDOC_NEEDS_OCR_EXIT,
  ANYDOC_USAGE_EXIT,
  inboundDocumentPath,
} from "./anydoc-cli.js";
import {
  createExecutionAgent,
  EXECUTION_INVOKED_TOOLS,
} from "./execution.js";
import {
  bindWhatsAppExecutionPlant,
  createInteractionExecuteWork,
} from "./interaction-execute-work.js";
import {
  isolateInboundFromMedia,
  plantHostMediaOnWorkbench,
} from "./inbound-plant.js";
import { inspectBashInvocation } from "./vfs-guard.js";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

const repoRoot = process.cwd();

test("speaker, zoend, Cedar, and World do not depend on AnyDoc", () => {
  for (const relative of [
    "packages/speaker/package.json",
    "packages/ontology/package.json",
    "packages/osdk/package.json",
    "packages/sdk/package.json",
  ]) {
    const pkg = JSON.parse(readFileSync(join(repoRoot, relative), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    assert.equal(
      pkg.dependencies?.["@firecrawl/anydoc"],
      undefined,
      `${relative} must not depend on @firecrawl/anydoc`,
    );
  }
  const speaker = readFileSync(
    join(repoRoot, "packages/speaker/src/interaction-tools.ts"),
    "utf8",
  );
  assert.doesNotMatch(speaker, /anydoc|@firecrawl/);
  const zoend = readFileSync(join(repoRoot, "apps/zoend/Cargo.toml"), "utf8");
  assert.doesNotMatch(zoend, /anydoc|firecrawl/);
  const cedar = readFileSync(
    join(repoRoot, "crates/zoen-adapters/Cargo.toml"),
    "utf8",
  );
  assert.doesNotMatch(cedar, /anydoc|firecrawl/);
  assert.deepEqual(EXECUTION_INVOKED_TOOLS, ["bash"]);
});

test("planted anydoc converts inbound xlsx through bash, not a speaker tool", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      const names = options.tools?.map((candidate) => candidate.name) ?? [];
      assert.ok(names.includes("bash"));
      assert.equal(names.includes("anydoc"), false);
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              input: JSON.stringify({ command: "anydoc inbound/quote.xlsx" }),
              toolCallId: "call.anydoc",
              toolName: "bash",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool_calls", unified: "tool-calls" },
          usage,
          warnings: [],
        };
      }
      return {
        content: [{ text: "converted inbound quote.xlsx", type: "text" }],
        finishReason: { raw: "stop", unified: "stop" },
        usage,
        warnings: [],
      };
    },
  });

  const workbench = await createExecutionAgent({
    blobs: { [inboundDocumentPath("quote.xlsx")]: quoteXlsx() },
    files: { [inboundDocumentPath("quote.csv")]: "sku,qty\nA,2\n" },
    model,
  });

  const planted = await workbench.sandbox.executeCommand("ls -1 bin inbound");
  assert.match(planted.stdout, /anydoc/);
  assert.match(planted.stdout, /zoen/);
  assert.match(planted.stdout, /quote\.xlsx/);

  const xlsx = await workbench.sandbox.executeCommand(
    "anydoc inbound/quote.xlsx",
  );
  assert.equal(xlsx.exitCode, 0, xlsx.stderr);
  assert.match(xlsx.stdout, /WIDGET/);
  assert.match(xlsx.stdout, /9/);

  const csv = await workbench.sandbox.executeCommand("anydoc inbound/quote.csv");
  assert.equal(csv.exitCode, 0, csv.stderr);
  assert.match(csv.stdout, /sku/);
  assert.match(csv.stdout, /A/);

  const result = await workbench.run("Convert inbound/quote.xlsx to markdown.");
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") {
    assert.fail("execution should succeed");
  }
  assert.deepEqual(result.invokedTools, ["bash"]);
});

test("planted anydoc fails NeedsOcr with named pages and refuses hosted OCR", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ text: "unused", type: "text" }],
      finishReason: { raw: "stop", unified: "stop" },
      usage,
      warnings: [],
    }),
  });
  const workbench = await createExecutionAgent({
    blobs: { [inboundDocumentPath("scan.pdf")]: imageOnlyPdf() },
    model,
  });

  const scanned = await workbench.sandbox.executeCommand(
    "anydoc inbound/scan.pdf",
  );
  assert.equal(scanned.exitCode, ANYDOC_NEEDS_OCR_EXIT, scanned.stderr);
  assert.match(scanned.stderr, /NeedsOcr/);
  assert.match(scanned.stderr, /pages 1/);
  assert.equal(scanned.stdout, "");

  const hosted = await workbench.sandbox.executeCommand(
    "anydoc inbound/scan.pdf --ocr hosted",
  );
  assert.equal(hosted.exitCode, ANYDOC_USAGE_EXIT, hosted.stderr);
  assert.match(hosted.stderr, /hosted OCR is out of Zoen/);
  assert.doesNotMatch(hosted.stderr, /firecrawl\.dev|Parse/i);
  assert.equal(hosted.stdout, "");
});

test("mediaRef bytes appear as inbound/quote.xlsx and anydoc /tmp stays denied", async () => {
  const xlsx = quoteXlsx();
  const mediaRef = "/tmp/zoen-wa-pair/media/wamid.xlsx";
  const mapped = isolateInboundFromMedia({
    bytes: xlsx,
    filename: "quote.xlsx",
    mediaRef,
  });
  assert.deepEqual(Object.keys(mapped.blobs), ["inbound/quote.xlsx"]);
  assert.equal(mapped.blobs["inbound/quote.xlsx"], xlsx);
  assert.deepEqual(mapped.files, {});

  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ text: "unused", type: "text" }],
      finishReason: { raw: "stop", unified: "stop" },
      usage,
      warnings: [],
    }),
  });
  const work = await createInteractionExecuteWork({
    blobs: mapped.blobs,
    files: mapped.files,
    model,
  });
  assert.ok(work !== undefined);
  assert.ok(work.workbench !== undefined);
  const listed = await work.workbench.sandbox.executeCommand("ls -1 inbound");
  assert.match(listed.stdout, /quote\.xlsx/);
  const converted = await work.workbench.sandbox.executeCommand(
    "anydoc inbound/quote.xlsx",
  );
  assert.equal(converted.exitCode, 0, converted.stderr);
  assert.match(converted.stdout, /WIDGET/);
  assert.equal(
    inspectBashInvocation("anydoc inbound/quote.xlsx", work.workbench.destination)
      .kind,
    "allow",
  );
  assert.equal(
    inspectBashInvocation(`anydoc ${mediaRef}`, work.workbench.destination).kind,
    "deny",
  );

  const dir = await mkdtemp(`${tmpdir()}/zoen-anydoc-plant-`);
  const hostPath = `${dir}/quote.xlsx`;
  await writeFile(hostPath, xlsx);
  const empty = await createInteractionExecuteWork({ model });
  assert.ok(empty !== undefined);
  assert.ok(empty.workbench !== undefined);
  const { plantInbound } = bindWhatsAppExecutionPlant(empty);
  assert.ok(plantInbound !== undefined);
  await plantInbound({ filename: "quote.xlsx", mediaRef: hostPath });
  const planted = await empty.workbench.sandbox.executeCommand("ls -1 inbound");
  assert.match(planted.stdout, /quote\.xlsx/);
  const afterPlant = await empty.workbench.sandbox.executeCommand(
    "anydoc inbound/quote.xlsx",
  );
  assert.equal(afterPlant.exitCode, 0, afterPlant.stderr);
  assert.match(afterPlant.stdout, /WIDGET/);
  const hosted = await empty.workbench.sandbox.executeCommand(
    "anydoc inbound/quote.xlsx --ocr hosted",
  );
  assert.equal(hosted.exitCode, ANYDOC_USAGE_EXIT);
  assert.match(hosted.stderr, /hosted OCR is out of Zoen/);
  await plantHostMediaOnWorkbench(empty.workbench, {
    filename: "copy.xlsx",
    mediaRef: hostPath,
  });
  const copies = await empty.workbench.sandbox.executeCommand("ls -1 inbound");
  assert.match(copies.stdout, /copy\.xlsx/);
});

test("vfs-guard allows isolate anydoc and blocks host media paths", () => {
  const destination = "/workspace/tenant.a/membership.1";
  assert.equal(
    inspectBashInvocation("anydoc inbound/quote.xlsx", destination).kind,
    "allow",
  );
  assert.equal(
    inspectBashInvocation("anydoc /tmp/quote.xlsx", destination).kind,
    "deny",
  );
});

function quoteXlsx(): Uint8Array {
  return zip([
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
    ],
    [
      "xl/sharedStrings.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
<si><t>sku</t></si><si><t>WIDGET</t></si>
</sst>`,
    ],
    [
      "xl/worksheets/sheet1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>2</v></c></row>
<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>9</v></c></row>
</sheetData>
</worksheet>`,
    ],
  ]);
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

function zip(files: ReadonlyArray<readonly [string, string]>): Uint8Array {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text, "utf8");
    const deflated = deflateRawSync(raw);
    const crc = crc32(raw);
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([local, nameBytes, deflated]);
    chunks.push(localEntry);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(deflated.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBytes.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBytes]));
    offset += localEntry.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
