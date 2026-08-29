import { defineSandbox } from "eve/sandbox";

function attributeText(
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.length > 0);
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
  const current = session.auth.current;
  if (current === null) {
    return "unbound";
  }
  return (
    attributeText(current.attributes, "membershipId") ??
    attributeText(current.attributes, "membership") ??
    current.principalId
  );
}

export default defineSandbox({
  async onSession({ use, ctx }) {
    const sandbox = await use();
    const key = membershipKey(ctx.session);
    await sandbox.writeTextFile({
      path: "membership",
      content: `${key}\n`,
    });
  },
});
