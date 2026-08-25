import assert from "node:assert/strict";
import test from "node:test";
import { providerKey, toChannelProvider } from "./index.js";

test("providerKey accepts ChannelProvider.as_str values", () => {
  assert.equal(String(providerKey("web_oidc")), "web_oidc");
  assert.equal(String(providerKey("whatsapp")), "whatsapp");
  assert.equal(String(providerKey("telegram")), "telegram");
  assert.equal(String(providerKey("linq")), "linq");
});

test("providerKey rejects Cloud API aliases and unknown keys", () => {
  assert.throws(() => providerKey("whatsapp_business"), /unsupported ProviderKey/);
  assert.throws(
    () => providerKey("whatsapp_cloud_api"),
    /unsupported ProviderKey/,
  );
  assert.throws(() => providerKey("not_a_provider"), /unsupported ProviderKey/);
});

test("toChannelProvider returns canonical whatsapp", () => {
  assert.equal(toChannelProvider(providerKey("whatsapp")), "whatsapp");
  assert.equal(toChannelProvider(providerKey("telegram")), "telegram");
  assert.equal(toChannelProvider(providerKey("linq")), "linq");
  assert.equal(toChannelProvider(providerKey("web_oidc")), "web_oidc");
});
