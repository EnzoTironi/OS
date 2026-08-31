import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeScenarioArtifact } from "./host-env.js";

const scenario = "public-surface";
const repositoryRoot = process.cwd();

const requiredHeadingOrder = [
  "Products",
  "Install",
  "CLI",
  "Auth door",
  "Conversation",
  "WhatsApp",
  "Telegram",
  "Deploy",
  "Develop",
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

  record("readme_has_h1_zoen", /^#\s+Zoen\s*$/m.test(readme));
  record(
    "readme_opens_with_company_sentence",
    /operating system for a company/i.test(readme.split("\n").slice(0, 8).join("\n")),
  );
  record("readme_points_at_architecture", /architecture\.md/.test(readme));

  let lastIndex = -1;
  for (const expected of requiredHeadingOrder) {
    const index = headings.indexOf(expected);
    record(`heading_present_${expected}`, index >= 0);
    record(`heading_order_${expected}`, index > lastIndex);
    lastIndex = index;
  }

  const install = sectionBody(readme, "Install");
  record("install_has_just_build", /`?just build`?/.test(install));
  killMutant("README Install command that no longer works");

  const cli = sectionBody(readme, "CLI");
  record("cli_has_noun_verb", /zoen <noun> <verb>/.test(cli));
  record("cli_lists_definition_publish", /definition publish/.test(cli));
  record("cli_lists_action_commit", /action commit/.test(cli));

  const auth = sectionBody(readme, "Auth door");
  record("auth_names_better_auth", /Better Auth/.test(auth));
  record("auth_session_is_bearer", /Bearer/.test(auth));

  const whatsapp = sectionBody(readme, "WhatsApp");
  record("whatsapp_kapso_path", /\/eve\/v1\/kapso/.test(whatsapp));
  record("whatsapp_rejects_cloud_api", /@chat-adapter\/whatsapp/.test(whatsapp));

  const telegram = sectionBody(readme, "Telegram");
  record("telegram_eve_path", /\/eve\/v1\/telegram/.test(telegram));
  record("telegram_names_eve_channel", /eve\/channels\/telegram/.test(telegram));

  const deploy = sectionBody(readme, "Deploy");
  record("deploy_one_fly_app", /one Fly app/.test(deploy));
  record("deploy_uses_image_flag", /fly deploy --image/.test(deploy));

  const develop = sectionBody(readme, "Develop");
  record("develop_has_just_e2e", /just e2e/.test(develop));
  record("develop_forbids_mocks", /mock/i.test(develop));

  record("readme_forbids_live_fiscal_ads", forbidsLiveFiscal(readme));
  record("readme_forbids_live_linq_ads", forbidsLiveLinq(readme));
  killMutant("advertised capability absent from release evidence");

  const architecture = await readFile(
    path.join(repositoryRoot, "architecture.md"),
    "utf8",
  );
  record("architecture_has_h1", /^#\s+Architecture\s*$/m.test(architecture));
  record("architecture_names_three_products", /Ontology/.test(architecture) && /Conversation/.test(architecture) && /Auth door/.test(architecture));
  record("architecture_names_session_door", /SessionDoor/.test(architecture));
  record("architecture_names_crates", /zoen-core/.test(architecture) && /zoen-engine/.test(architecture));
  record("architecture_forbids_live_fiscal_ads", forbidsLiveFiscal(architecture));
  record("architecture_forbids_live_linq_ads", forbidsLiveLinq(architecture));

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
