import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationKeyFrom,
  providerKey,
  providerThreadRef,
  providerUserRef,
} from "./brands.js";
import {
  conversationIdFromKind,
  conversationKeyFromKind,
  conversationKind,
  conversationKindFromChannel,
} from "./conversation-kind.js";
import type { ChannelObservation } from "./types.js";

function channel(input: {
  readonly group?: boolean;
  readonly thread: string;
  readonly user: string;
}): ChannelObservation {
  const thread = providerThreadRef(input.thread);
  return {
    provider: providerKey("whatsapp"),
    providerUser: providerUserRef(input.user),
    receivedAt: "2026-08-26T15:00:00.000Z",
    thread,
    ...(input.group === true ? { group: { thread } } : {}),
  };
}

test("one_to_one rejects a group JID subject", () => {
  assert.throws(
    () => conversationKind({ kind: "one_to_one", subject: "120363-group@g.us" }),
    /one_to_one must not accept a group JID/,
  );
  assert.throws(
    () =>
      conversationKind({
        kind: "one_to_one",
        subject: "120363-group@g.us:suffix",
      }),
    /one_to_one must not accept a group JID/,
  );
});

test("group rejects a person JID or E.164 as groupJid", () => {
  assert.throws(
    () =>
      conversationKind({
        groupJid: "553199941160@s.whatsapp.net",
        kind: "group",
      }),
    /group must not accept a person JID or E\.164/,
  );
  assert.throws(
    () => conversationKind({ groupJid: "+553199941160", kind: "group" }),
    /group must not accept a person JID or E\.164/,
  );
  assert.throws(
    () => conversationKind({ groupJid: "553199941160", kind: "group" }),
    /group must not accept a person JID or E\.164/,
  );
});

test("conversationIdFromKind is the thread id used inside conversationId", () => {
  const dm = conversationKind({
    kind: "one_to_one",
    subject: "553199941160@s.whatsapp.net",
  });
  const group = conversationKind({
    groupJid: "120363-group@g.us",
    kind: "group",
  });
  assert.equal(conversationIdFromKind(dm), "553199941160@s.whatsapp.net");
  assert.equal(conversationIdFromKind(group), "120363-group@g.us");
});

test("1:1 and group kinds produce different ConversationKeys", () => {
  const base = {
    accountId: "account.wa.enzo",
    provider: "whatsapp",
    tenantId: "tenant.wa.enzo",
    workspaceId: "workload.personal",
  };
  const dm = conversationKeyFromKind({
    ...base,
    kind: conversationKind({
      kind: "one_to_one",
      subject: "553199941160@s.whatsapp.net",
    }),
  });
  const group = conversationKeyFromKind({
    ...base,
    kind: conversationKind({
      groupJid: "120363-group@g.us",
      kind: "group",
    }),
  });
  assert.notEqual(dm, group);
  assert.equal(
    dm,
    conversationKeyFrom({
      accountId: base.accountId,
      conversationId: "whatsapp:553199941160@s.whatsapp.net",
      tenantId: base.tenantId,
      workspaceId: base.workspaceId,
    }),
  );
  assert.equal(
    group,
    conversationKeyFrom({
      accountId: base.accountId,
      conversationId: "whatsapp:120363-group@g.us",
      tenantId: base.tenantId,
      workspaceId: base.workspaceId,
    }),
  );
});

test("conversationKindFromChannel uses group object or person thread", () => {
  const dm = conversationKindFromChannel(
    channel({
      thread: "553199941160@s.whatsapp.net",
      user: "553199941160@s.whatsapp.net",
    }),
  );
  assert.deepEqual(dm, {
    kind: "one_to_one",
    subject: "553199941160@s.whatsapp.net",
  });
  const group = conversationKindFromChannel(
    channel({
      group: true,
      thread: "120363-group@g.us",
      user: "553199941160@s.whatsapp.net",
    }),
  );
  assert.deepEqual(group, {
    groupJid: "120363-group@g.us",
    kind: "group",
  });
});
