import assert from "node:assert/strict";
import test from "node:test";
import {
  isHostPublicHref,
  parseHostPublicHref,
  resolvePublicOrigin,
  withOnboardHref,
} from "./public-origin.js";

test("isHostPublicHref keeps real https and drops app.zoen.local and constructed approve", () => {
  assert.equal(isHostPublicHref("https://zoen.tironi.xyz/onboard/tok"), true);
  assert.equal(isHostPublicHref("https://workshop.example/quote"), true);
  assert.equal(
    isHostPublicHref("https://zoen.tironi.xyz/approve/external.web_report"),
    false,
  );
  assert.equal(
    isHostPublicHref("https://zoen.tironi.xyz/approve/external.fiscal_issuance"),
    false,
  );
  assert.equal(isHostPublicHref("https://zoen.tironi.xyz/approve/e"), false);
  assert.equal(isHostPublicHref("https://app.zoen.local/onboard/tok"), false);
  assert.equal(isHostPublicHref("https://app.zoen.local/approve/e"), false);
  assert.equal(isHostPublicHref("http://zoen.tironi.xyz/onboard/tok"), false);
  assert.equal(isHostPublicHref("not-a-url"), false);
  assert.equal(parseHostPublicHref("https://app.zoen.local/approve/e"), null);
  assert.equal(
    parseHostPublicHref("https://zoen.tironi.xyz/approve/external.web_report"),
    null,
  );
});

test("resolvePublicOrigin still defaults to app.zoen.local", () => {
  assert.equal(resolvePublicOrigin(undefined, {}), "https://app.zoen.local");
});

test("withOnboardHref refuses a local placeholder", () => {
  assert.equal(
    withOnboardHref("oi, entra quando quiser", "https://app.zoen.local/onboard/tok"),
    "oi, entra quando quiser",
  );
  assert.equal(
    withOnboardHref("oi", "https://zoen.tironi.xyz/onboard/tok"),
    "oi\nhttps://zoen.tironi.xyz/onboard/tok",
  );
});
