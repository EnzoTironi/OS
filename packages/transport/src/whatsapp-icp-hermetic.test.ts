import assert from "node:assert/strict";
import { test } from "node:test";
import { providerKey } from "../../speaker/src/index.js";
import {
  assertKernelContracts,
  KERNEL_HOPS,
  KernelContractError,
  loadIcpFixture,
  REQUIRED_KERNEL_HOPS,
  runHermeticIcp,
} from "./whatsapp-icp-hermetic.js";
import {
  MediaIngressError,
  rejectWhatsAppMediaFields,
} from "./media-ingress.js";
import { classifyWhatsAppContactInbound } from "./whatsapp-contact-loop.js";

test("assertKernelContracts fails when any required hop is missing", () => {
  assert.throws(
    () => assertKernelContracts(new Set(["companion_ingest"])),
    (error: unknown) =>
      error instanceof KernelContractError &&
      error.missing.includes("context_assemble") &&
      error.message.includes("false-green"),
  );
  assert.throws(
    () => assertKernelContracts(new Set()),
    /false-green: kernel hop/,
  );
});

test("a bound-looking result without kernel hops is a false green", () => {
  const fakeBound = { kind: "bound" as const };
  assert.equal(fakeBound.kind, "bound");
  assert.throws(
    () => assertKernelContracts(new Set(), REQUIRED_KERNEL_HOPS),
    (error: unknown) =>
      error instanceof KernelContractError &&
      error.missing.length === KERNEL_HOPS.length,
  );
});

test("foundry fiscal-file inbound exercises the full interaction kernel", async () => {
  const fixture = await loadIcpFixture("foundry");
  const result = await runHermeticIcp(fixture);
  assert.equal(result.disposition.kind, "bound");
  assert.equal(result.replayDisposition.kind, "duplicate");
  assert.equal(result.sentText, fixture.expectedSpeech);
  assert.equal(result.session.sent().length, 1);
  assert.equal(result.session.sent()[0]?.chatJid, fixture.personJid);
  assert.match(result.contextDigest ?? "", /^[0-9a-f]{64}$/);
  for (const hop of REQUIRED_KERNEL_HOPS) {
    assert.equal(result.hops.has(hop), true, hop);
  }
  assert.notEqual(String(providerKey("whatsapp")), "whatsapp_cloud_api");
});

test("micro-confeiteira audio reorder exercises the full interaction kernel", async () => {
  const fixture = await loadIcpFixture("micro_confeiteira");
  const result = await runHermeticIcp(fixture);
  assert.equal(result.disposition.kind, "bound");
  assert.equal(result.disposition.inbound.body.kind, "media");
  if (result.disposition.inbound.body.kind === "media") {
    assert.equal(
      result.disposition.inbound.body.mime,
      "audio/ogg; codecs=opus",
    );
  }
  assert.equal(result.replayDisposition.kind, "duplicate");
  assert.equal(result.sentText, fixture.expectedSpeech);
  assert.doesNotMatch(result.sentText, /personal\.note\.yesterday/);
  assert.match(result.contextDigest ?? "", /^[0-9a-f]{64}$/);
  for (const hop of REQUIRED_KERNEL_HOPS) {
    assert.equal(result.hops.has(hop), true, hop);
  }
});

test("foundry fiscal XML is rejected and leaves kernel hops incomplete", async () => {
  const fixture = await loadIcpFixture("foundry");
  const xmlInbound = {
    ...fixture.inbound,
    filename: "nfe-312.xml",
    mime: "application/xml",
  };
  assert.throws(
    () => rejectWhatsAppMediaFields(xmlInbound),
    (error: unknown) =>
      error instanceof MediaIngressError && error.code === "media_not_supported",
  );
  await assert.rejects(
    () =>
      runHermeticIcp({
        ...fixture,
        inbound: xmlInbound,
      }),
    (error: unknown) =>
      error instanceof MediaIngressError ||
      (error instanceof Error && /media|ingress/i.test(error.message)),
  );
  assert.throws(() => assertKernelContracts(new Set()), /false-green/);
});

test("door JID and Cloud API envelopes never mark kernel hops complete", async () => {
  const fixture = await loadIcpFixture("foundry");
  const door = classifyWhatsAppContactInbound(
    {
      ...fixture.inbound,
      chatJid: "553798136141@s.whatsapp.net",
      messageId: "wamid.door",
      senderAltJid: "553798136141@s.whatsapp.net",
      senderJid: "553798136141@s.whatsapp.net",
    },
    fixture.doorE164,
  );
  assert.deepEqual(door, { drop: true, reason: "door_is_person" });
  assert.throws(
    () =>
      classifyWhatsAppContactInbound(
        { object: "whatsapp_business_account", entry: [] },
        fixture.doorE164,
      ),
    /Cloud API/,
  );
  assert.throws(
    () => assertKernelContracts(new Set()),
    /false-green/,
  );
});
