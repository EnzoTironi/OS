import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeScenarioArtifact } from "./host-env.js";

const scenario = "public-surface";
const repositoryRoot = process.cwd();

/** Public narrative H2 order required by #267 / AD-16. */
const requiredHeadingOrder = [
  "Demo",
  "Quickstart",
  "Sample Company",
  "Packs",
  "Why not LLM + tools",
  "Self-host",
  "Architecture",
] as const;

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: string): void {
  mutantsKilled.push(name);
}

function extractH2Headings(markdown: string): string[] {
  const headings: string[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match !== null) {
      headings.push(match[1]!);
    }
  }
  return headings;
}

function sectionBody(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  assert.ok(start >= 0, `missing section ${heading}`);
  const after = markdown.slice(start + `## ${heading}`.length);
  const next = after.search(/\n##\s+/);
  return next < 0 ? after : after.slice(0, next);
}

function forbidsLiveFiscal(text: string): boolean {
  const lower = text.toLowerCase();
  const banned = [
    "live fiscal",
    "live systax",
    "live plugnotas",
    "live protheus",
    "fiscal is supported",
    "fiscal supported",
  ];
  return banned.every((phrase) => !lower.includes(phrase));
}

function forbidsLiveLinq(text: string): boolean {
  const lower = text.toLowerCase();
  return !lower.includes("live linq") && !/\blinq\b.*\bsupported\b/i.test(text);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const readmePath = path.join(repositoryRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  const headings = extractH2Headings(readme);

  record("readme_has_h1_promise", /^#\s+Zoen OS\s*$/m.test(readme));
  record(
    "readme_opens_with_outcome_sentence",
    /executable semantic operating system/i.test(readme.split("\n").slice(0, 8).join("\n")),
  );

  let lastIndex = -1;
  for (const expected of requiredHeadingOrder) {
    const index = headings.indexOf(expected);
    record(`heading_present_${expected}`, index >= 0);
    record(`heading_order_${expected}`, index > lastIndex);
    lastIndex = index;
  }

  const architectureIndex = headings.indexOf("Architecture");
  const quickstartIndex = headings.indexOf("Quickstart");
  record(
    "architecture_after_quickstart",
    architectureIndex > quickstartIndex && quickstartIndex >= 0,
  );
  killMutant("architecture wall before Quickstart");

  const quickstart = sectionBody(readme, "Quickstart");
  record("quickstart_has_just_start", /`?just start`?/.test(quickstart));
  record(
    "quickstart_has_activation_sample",
    /`?just e2e activation-sample`?/.test(quickstart),
  );
  killMutant("README Quickstart command that no longer works");

  const packs = sectionBody(readme, "Packs");
  record(
    "packs_outcome_first",
    /outcome/i.test(packs) && (/#260/.test(packs) || /coming/i.test(packs)),
  );

  const demo = sectionBody(readme, "Demo");
  record("demo_links_demo_guide", /docs\/demos/i.test(demo));
  record(
    "demo_rejects_fake_chat",
    /do not expect a fake chat/i.test(demo) || /no fake chat/i.test(demo),
  );

  record("readme_forbids_live_fiscal_ads", forbidsLiveFiscal(readme));
  record("readme_forbids_live_linq_ads", forbidsLiveLinq(readme));
  killMutant("advertised capability absent from release evidence");

  const demoGuide = await readFile(
    path.join(repositoryRoot, "docs/demos/README.md"),
    "utf8",
  );
  const demoHeadings = extractH2Headings(demoGuide);
  const requiredDemoHeadings = [
    "Five-minute company",
    "Agent safely acts",
    "Your messy data",
  ] as const;
  for (const heading of requiredDemoHeadings) {
    record(`demo_heading_${heading}`, demoHeadings.includes(heading));
  }
  record(
    "demo_guide_points_at_sample_company",
    /just start/.test(demoGuide) && /activation-sample/.test(demoGuide),
  );
  record(
    "demo_guide_names_agent_capabilities_live",
    /agent-capabilities-live/.test(demoGuide),
  );
  record(
    "demo_guide_names_company_bootstrap_shadow",
    /company-bootstrap-shadow/.test(demoGuide),
  );
  record(
    "demo_guide_names_remaining_gaps",
    /#273/.test(demoGuide) || /recorded/i.test(demoGuide),
  );

  const packsDirectory = await readFile(
    path.join(repositoryRoot, "docs/product/pack-directory.md"),
    "utf8",
  );
  record(
    "pack_directory_outcome_first",
    /outcome/i.test(packsDirectory) && /#260/.test(packsDirectory),
  );
  record(
    "pack_directory_names_kitchen_in_flight",
    /#264/.test(packsDirectory) && /in flight/i.test(packsDirectory),
  );
  record(
    "pack_directory_rejects_marketplace_commerce",
    /marketplace commerce/i.test(packsDirectory) &&
      /out of scope/i.test(packsDirectory),
  );

  const productGuide = await readFile(
    path.join(repositoryRoot, "docs/product/public-narrative.md"),
    "utf8",
  );
  record(
    "product_narrative_lists_hierarchy",
    requiredHeadingOrder.every((heading) => productGuide.includes(heading)),
  );

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    finishedAt: new Date().toISOString(),
    headings,
    mutantsKilled,
    requiredHeadingOrder,
    startedAt,
  });

  console.log(`public-surface PASS artifact=${artifactPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
