import { defineSandbox } from "eve/sandbox";
import { parseSessionMembership, workbenchBackend } from "./workbench";

function attributeText(
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined,
  key: string
): string | undefined {
  const value = attributes?.[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value.find(
      (entry) => typeof entry === "string" && entry.length > 0
    );
    return first;
  }
  return undefined;
}

function membershipKey(session: {
  readonly auth: {
    readonly current: {
      readonly attributes: Readonly<Record<string, string | readonly string[]>>;
      readonly principalId: string;
    } | null;
  };
}): string {
  const { current } = session.auth;
  if (current === null) {
    return "unbound";
  }
  return (
    attributeText(current.attributes, "membershipId") ??
    attributeText(current.attributes, "membership") ??
    "unbound"
  );
}

export default defineSandbox({
  backend: () => workbenchBackend({}),
  async onSession({ use, ctx }) {
    const membershipId = parseSessionMembership(membershipKey(ctx.session));
    const sandbox = await use({ membershipId });
    await sandbox.writeTextFile({
      content: `${membershipId}\n`,
      path: "membership",
    });
  },
});
