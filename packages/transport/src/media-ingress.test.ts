import assert from "node:assert/strict";
import test from "node:test";
import {
  MediaIngressError,
  MAX_MEDIA_BYTES,
  rejectWhatsAppMediaFields,
  validateMediaBlob,
  whatsappAdvertisesMedia,
  WHATSAPP_INGESTED_MEDIA_TYPES,
} from "./media-ingress.js";

test("WhatsApp does not advertise ingested media", () => {
  assert.deepEqual(WHATSAPP_INGESTED_MEDIA_TYPES, []);
  assert.equal(whatsappAdvertisesMedia(), false);
});

test("companion media fields are rejected", () => {
  assert.throws(
    () => rejectWhatsAppMediaFields({ body: "oi", imageUrl: "https://x/a.jpg" }),
    (error: unknown) =>
      error instanceof MediaIngressError && error.code === "media_not_supported",
  );
  rejectWhatsAppMediaFields({ body: "oi" });
});

test("future media blobs fail closed on type, size, content, and provenance", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  assert.throws(
    () =>
      validateMediaBlob({
        bytes: png,
        declaredMime: "image/png",
        provenance: "companion:wamid.1",
      }),
    (error: unknown) =>
      error instanceof MediaIngressError && error.code === "media_not_supported",
  );
  assert.throws(
    () =>
      validateMediaBlob({
        allow: ["image/png"],
        bytes: png,
        declaredMime: "image/png",
      }),
    (error: unknown) =>
      error instanceof MediaIngressError &&
      error.code === "media_provenance_missing",
  );
  assert.throws(
    () =>
      validateMediaBlob({
        allow: ["image/png"],
        bytes: new Uint8Array(MAX_MEDIA_BYTES + 1),
        declaredMime: "image/png",
        provenance: "companion:wamid.1",
      }),
    (error: unknown) =>
      error instanceof MediaIngressError && error.code === "media_too_large",
  );
  assert.throws(
    () =>
      validateMediaBlob({
        allow: ["image/png"],
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0x00]),
        declaredMime: "image/png",
        provenance: "companion:wamid.1",
      }),
    (error: unknown) =>
      error instanceof MediaIngressError && error.code === "media_content_mismatch",
  );
});
