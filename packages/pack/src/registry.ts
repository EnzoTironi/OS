import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type PackSignature = {
  readonly algorithm: "ed25519";
  readonly publicKeyId: string;
  readonly signatureB64: string;
};

export type PublisherKeyPair = {
  readonly publicKeyId: string;
  readonly publicKeyPem: string;
  readonly privateKeyPem: string;
  readonly publicKeyRawB64: string;
};

export type OpenedPack = {
  readonly kind: "opened";
  readonly packDigest: string;
  readonly manifestJcs: string;
  readonly signatureVerified: true;
  readonly ontologyArtifacts: ReadonlyArray<{
    readonly definitionId: string;
    readonly digest: string;
    readonly canonicalJson: string;
  }>;
};

export type OpenFailure =
  | { readonly kind: "digestMismatch"; readonly expected: string; readonly actual: string }
  | { readonly kind: "signatureInvalid" }
  | { readonly kind: "objectNotFound" };

export function createPublisherKeyPair(publicKeyId: string): PublisherKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const spkiDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const publicKeyRawB64 = spkiDer.subarray(spkiDer.length - 32).toString("base64");
  return {
    privateKeyPem,
    publicKeyId,
    publicKeyPem,
    publicKeyRawB64,
  };
}

export function signPackDigest(
  packDigest: string,
  key: PublisherKeyPair,
): PackSignature {
  const message = Buffer.from(packDigest, "hex");
  const signature = sign(null, message, key.privateKeyPem);
  return {
    algorithm: "ed25519",
    publicKeyId: key.publicKeyId,
    signatureB64: signature.toString("base64"),
  };
}

export function verifyPackDigestSignature(
  packDigest: string,
  signature: PackSignature,
  publicKeyPemOrRawB64: string,
): boolean {
  const message = Buffer.from(packDigest, "hex");
  const signatureBytes = Buffer.from(signature.signatureB64, "base64");
  try {
    if (publicKeyPemOrRawB64.includes("BEGIN PUBLIC KEY")) {
      return verify(null, message, publicKeyPemOrRawB64, signatureBytes);
    }
    const raw = Buffer.from(publicKeyPemOrRawB64, "base64");
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const spki = Buffer.concat([spkiPrefix, raw]);
    return verify(
      null,
      message,
      {
        format: "der",
        key: spki,
        type: "spki",
      },
      signatureBytes,
    );
  } catch {
    return false;
  }
}

export function openInlinePack(input: {
  readonly expectedDigest: string;
  readonly manifestJcs: string;
  readonly signature: PackSignature;
  readonly publicKeyPemOrRawB64: string;
  readonly ontologyArtifacts: ReadonlyArray<{
    readonly definitionId: string;
    readonly digest: string;
    readonly canonicalJson: string;
  }>;
}): OpenedPack | OpenFailure {
  const actual = createHash("sha256").update(input.manifestJcs).digest("hex");
  if (actual !== input.expectedDigest) {
    return {
      actual,
      expected: input.expectedDigest,
      kind: "digestMismatch",
    };
  }
  if (
    !verifyPackDigestSignature(
      actual,
      input.signature,
      input.publicKeyPemOrRawB64,
    )
  ) {
    return { kind: "signatureInvalid" };
  }
  return {
    kind: "opened",
    manifestJcs: input.manifestJcs,
    ontologyArtifacts: input.ontologyArtifacts,
    packDigest: actual,
    signatureVerified: true,
  };
}

export async function writeFileObjectSource(input: {
  readonly root: string;
  readonly packDigest: string;
  readonly manifestJcs: string;
  readonly signature: PackSignature;
  readonly publicKeyPem: string;
  readonly ontologyArtifacts: ReadonlyArray<{
    readonly definitionId: string;
    readonly digest: string;
    readonly canonicalJson: string;
  }>;
}): Promise<string> {
  const directory = path.join(input.root, input.packDigest);
  await mkdir(path.join(directory, "ontology"), { recursive: true });
  await writeFile(path.join(directory, "manifest.jcs.json"), input.manifestJcs);
  await writeFile(
    path.join(directory, "signature.json"),
    JSON.stringify({
      algorithm: input.signature.algorithm,
      publicKeyId: input.signature.publicKeyId,
      signatureB64: input.signature.signatureB64,
    }),
  );
  await writeFile(path.join(directory, "public_key.pem"), input.publicKeyPem);
  for (const artifact of input.ontologyArtifacts) {
    await writeFile(
      path.join(
        directory,
        "ontology",
        `${artifact.definitionId}.${artifact.digest}.json`,
      ),
      artifact.canonicalJson,
    );
  }
  return directory;
}

export async function openFileObjectSource(input: {
  readonly root: string;
  readonly packDigest: string;
}): Promise<OpenedPack | OpenFailure> {
  const directory = path.join(input.root, input.packDigest);
  let manifestJcs: string;
  let signatureRaw: string;
  let publicKeyPem: string;
  try {
    manifestJcs = (await readFile(path.join(directory, "manifest.jcs.json"), "utf8")).trim();
    signatureRaw = await readFile(path.join(directory, "signature.json"), "utf8");
    publicKeyPem = await readFile(path.join(directory, "public_key.pem"), "utf8");
  } catch {
    return { kind: "objectNotFound" };
  }
  const signature = JSON.parse(signatureRaw) as PackSignature;
  const ontologyArtifacts: Array<{
    definitionId: string;
    digest: string;
    canonicalJson: string;
  }> = [];
  return openInlinePack({
    expectedDigest: input.packDigest,
    manifestJcs,
    ontologyArtifacts,
    publicKeyPemOrRawB64: publicKeyPem,
    signature,
  });
}

export function shareUri(token: string): string {
  return `zoen://pack/s/${token}`;
}

const FORBIDDEN_KEY_FRAGMENTS = [
  "password",
  "apiKey",
  "api_key",
  "clientSecret",
  "accessToken",
  "refreshToken",
  "oauth",
] as const;

export function assertNoSecretFields(value: unknown): void {
  const forbidden = collectForbiddenKeys(value, "");
  if (forbidden.length > 0) {
    throw new Error(`forbidden secret-shaped fields: ${forbidden.join(",")}`);
  }
}

function collectForbiddenKeys(value: unknown, pathPrefix: string): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      collectForbiddenKeys(child, `${pathPrefix}${index}.`),
    );
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (
      FORBIDDEN_KEY_FRAGMENTS.some((fragment) =>
        key.toLowerCase().includes(fragment.toLowerCase()),
      )
    ) {
      found.push(`${pathPrefix}${key}`);
    }
    found.push(...collectForbiddenKeys(child, `${pathPrefix}${key}.`));
  }
  return found;
}
