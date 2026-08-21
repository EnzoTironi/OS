const decimalPattern = /^(?<sign>-?)(?<whole>[0-9]+)(?:\.(?<fraction>[0-9]+))?$/u;
const maximumDecimalLength = 128;

type DecimalParts = {
  readonly coefficient: bigint;
  readonly scale: number;
};

export function canonicalDecimal(value: string): string {
  return formatDecimal(parseDecimal(value));
}

export function addExactDecimals(values: readonly string[]): string {
  return formatDecimal(
    values.reduce<DecimalParts>(
      (total, value) => addParts(total, parseDecimal(value)),
      { coefficient: 0n, scale: 0 },
    ),
  );
}

export function multiplyExactDecimals(left: string, right: string): string {
  const leftParts = parseDecimal(left);
  const rightParts = parseDecimal(right);
  return formatDecimal({
    coefficient: leftParts.coefficient * rightParts.coefficient,
    scale: leftParts.scale + rightParts.scale,
  });
}

export function decimalJsonNumber(value: string): number {
  const parsed = Number(canonicalDecimal(value));
  if (!Number.isFinite(parsed)) {
    throw new Error("fiscal decimal is outside the JSON number range");
  }
  return parsed;
}

function parseDecimal(value: string): DecimalParts {
  if (value.length > maximumDecimalLength) {
    throw new Error("fiscal decimal exceeds the supported length");
  }
  const match = decimalPattern.exec(value);
  const whole = match?.groups?.whole;
  if (whole === undefined) {
    throw new Error("fiscal decimal is invalid");
  }
  const fraction = match.groups?.fraction ?? "";
  const magnitude = BigInt(`${whole}${fraction}`);
  return {
    coefficient: match.groups?.sign === "-" ? -magnitude : magnitude,
    scale: fraction.length,
  };
}

function addParts(left: DecimalParts, right: DecimalParts): DecimalParts {
  const scale = Math.max(left.scale, right.scale);
  return {
    coefficient:
      left.coefficient * powerOfTen(scale - left.scale) +
      right.coefficient * powerOfTen(scale - right.scale),
    scale,
  };
}

function formatDecimal(parts: DecimalParts): string {
  if (parts.coefficient === 0n) {
    return "0";
  }
  const negative = parts.coefficient < 0n;
  const magnitude = (negative ? -parts.coefficient : parts.coefficient)
    .toString()
    .padStart(parts.scale + 1, "0");
  const whole =
    parts.scale === 0 ? magnitude : magnitude.slice(0, -parts.scale);
  const fraction =
    parts.scale === 0
      ? ""
      : magnitude.slice(-parts.scale).replace(/0+$/u, "");
  const canonicalWhole = whole.replace(/^0+(?=[0-9])/u, "");
  const unsigned =
    fraction === "" ? canonicalWhole : `${canonicalWhole}.${fraction}`;
  return negative ? `-${unsigned}` : unsigned;
}

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}
