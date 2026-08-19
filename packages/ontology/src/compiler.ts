import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse } from "@babel/parser";
import { isExpression } from "@babel/types";
import type {
  Expression as BabelExpression,
  Identifier,
  ImportDeclaration,
  PrivateName,
  VariableDeclaration,
} from "@babel/types";
import canonicalize from "canonicalize";
import { z } from "zod";
import type {
  ActionDefinition,
  ActionEffect,
  CanonicalDefinitionBundle,
  CompiledDefinition,
  ComputationDefinition,
  ExactValue,
  Expression,
  InputDefinition,
  RawDefinitionBundle,
  RelationDefinition,
  RelationTarget,
  TypeDefinition,
  ValueType,
} from "./model.js";

type AuthorValue =
  | boolean
  | null
  | number
  | string
  | readonly AuthorValue[]
  | { readonly [key: string]: AuthorValue };

const execFileAsync = promisify(execFile);
const authorFunctions = new Set([
  "defineAction",
  "defineBundle",
  "defineComputation",
  "defineRelation",
  "defineType",
]);

const identifierSchema = z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/);
const canonicalDecimalSchema = z.string().refine(isCanonicalDecimal, {
  message: "exact decimal is not canonical",
});
const canonicalIntegerSchema = z.string().regex(/^(0|-[1-9][0-9]*|[1-9][0-9]*)$/);

const valueTypeSchema: z.ZodType<ValueType> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bool") }).strict(),
  z.object({ kind: z.literal("decimal") }).strict(),
  z.object({ kind: z.literal("integer") }).strict(),
  z
    .object({
      kind: z.literal("quantity"),
      unit: identifierSchema,
    })
    .strict(),
  z.object({ kind: z.literal("text") }).strict(),
]);

const exactValueSchema: z.ZodType<ExactValue> = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("bool"),
      value: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("decimal"),
      value: canonicalDecimalSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("integer"),
      value: canonicalIntegerSchema,
    })
    .strict(),
  z
    .object({
      amount: canonicalDecimalSchema,
      kind: z.literal("quantity"),
      unit: identifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("text"),
      value: z.string(),
    })
    .strict(),
]);

const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("binary"),
        left: expressionSchema,
        operator: z.enum([
          "add",
          "greater_than",
          "multiply",
          "subtract",
        ]),
        right: expressionSchema,
      })
      .strict(),
    z
      .object({
        inputId: identifierSchema,
        kind: z.literal("input"),
      })
      .strict(),
    z
      .object({
        kind: z.literal("literal"),
        value: exactValueSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("relation"),
        relationId: identifierSchema,
      })
      .strict(),
  ]),
);

const inputSchema: z.ZodType<InputDefinition> = z
  .object({
    id: identifierSchema,
    valueType: valueTypeSchema,
  })
  .strict();

const typeSchema: z.ZodType<TypeDefinition> = z
  .object({
    attributes: z.array(inputSchema),
    id: identifierSchema,
  })
  .strict();

const relationTargetSchema: z.ZodType<RelationTarget> = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("type"),
        typeId: identifierSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("value"),
        valueType: valueTypeSchema,
      })
      .strict(),
  ],
);

const relationSchema: z.ZodType<RelationDefinition> = z
  .object({
    cardinality: z.enum(["many", "one"]),
    id: identifierSchema,
    sourceType: identifierSchema,
    target: relationTargetSchema,
  })
  .strict();

const computationSchema: z.ZodType<ComputationDefinition> = z
  .object({
    expression: expressionSchema,
    id: identifierSchema,
    inputs: z.array(inputSchema),
    returns: valueTypeSchema,
  })
  .strict();

const actionEffectSchema: z.ZodType<ActionEffect> = z
  .object({
    relationId: identifierSchema,
    value: expressionSchema,
  })
  .strict();

const actionSchema: z.ZodType<ActionDefinition> = z
  .object({
    effects: z.array(actionEffectSchema),
    id: identifierSchema,
    inputs: z.array(inputSchema),
    precondition: expressionSchema,
  })
  .strict();

const rawBundleSchema: z.ZodType<RawDefinitionBundle> = z
  .object({
    actions: z.array(actionSchema),
    computations: z.array(computationSchema),
    id: identifierSchema,
    relations: z.array(relationSchema),
    revision: z.number().int().positive().safe(),
    types: z.array(typeSchema),
  })
  .strict();

export async function compileDefinition(
  sourcePath: string,
): Promise<CompiledDefinition> {
  const absoluteSourcePath = path.resolve(sourcePath);
  await typecheck(absoluteSourcePath);
  const source = await readFile(absoluteSourcePath, "utf8");
  const authorValue = parseAuthorModule(absoluteSourcePath, source);
  const raw = rawBundleSchema.parse(authorValue);
  validateBundle(raw);
  const definition = normalize(raw);
  const canonicalJson = canonicalize(definition);
  if (canonicalJson === undefined) {
    throw new Error("canonical definition could not be serialized");
  }
  const digest = createHash("sha256").update(canonicalJson).digest("hex");

  return { canonicalJson, definition, digest };
}

async function typecheck(sourcePath: string): Promise<void> {
  const repositoryRoot = process.cwd();
  const configPath = path.join(repositoryRoot, "tsconfig.json");
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "zoen-typecheck-"),
  );
  const temporaryConfig = path.join(temporaryDirectory, "tsconfig.json");
  await writeFile(
    temporaryConfig,
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        rootDir: path.parse(sourcePath).root,
        typeRoots: [path.join(repositoryRoot, "node_modules", "@types")],
      },
      extends: configPath,
      files: [sourcePath],
      include: [],
    }),
  );

  try {
    await execFileAsync(
      process.execPath,
      [
        path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
        "--project",
        temporaryConfig,
      ],
      { cwd: repositoryRoot },
    );
  } catch (error: unknown) {
    throw new Error(`TypeScript typecheck failed:\n${commandOutput(error)}`, {
      cause: error,
    });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

function commandOutput(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const stdout = Reflect.get(error, "stdout");
    const stderr = Reflect.get(error, "stderr");
    const output = [stdout, stderr]
      .filter((value) => typeof value === "string" && value.length > 0)
      .join("\n");
    if (output.length > 0) {
      return output;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function parseAuthorModule(
  fileName: string,
  source: string,
): AuthorValue {
  const sourceFile = parse(source, {
    plugins: ["typescript"],
    sourceFilename: fileName,
    sourceType: "module",
  });
  const bindings = new Map<string, BabelExpression>();
  const imports = new Set<string>();
  let defaultExpression: BabelExpression | undefined;

  for (const statement of sourceFile.program.body) {
    if (statement.type === "ImportDeclaration") {
      parseImport(statement, imports);
      continue;
    }
    if (statement.type === "VariableDeclaration") {
      parseBindings(statement, bindings);
      continue;
    }
    if (
      statement.type === "ExportDefaultDeclaration" &&
      isExpression(statement.declaration)
    ) {
      if (defaultExpression !== undefined) {
        throw new Error("a .zoen.ts module must have one default export");
      }
      defaultExpression = statement.declaration;
      continue;
    }
    throw new Error(`unsupported top-level syntax: ${statement.type}`);
  }

  if (
    defaultExpression === undefined ||
    defaultExpression.type !== "CallExpression" ||
    defaultExpression.callee.type !== "Identifier" ||
    defaultExpression.callee.name !== "defineBundle"
  ) {
    throw new Error("the default export must call defineBundle");
  }

  return evaluate(defaultExpression, bindings, imports, new Set());
}

function parseImport(
  declaration: ImportDeclaration,
  imports: Set<string>,
): void {
  if (declaration.source.value !== "@zoen/ontology") {
    throw new Error(".zoen.ts may only import @zoen/ontology");
  }
  for (const specifier of declaration.specifiers) {
    if (specifier.type !== "ImportSpecifier") {
      throw new Error(".zoen.ts must use named ontology imports");
    }
    const importedName =
      specifier.imported.type === "Identifier"
        ? specifier.imported.name
        : specifier.imported.value;
    if (!authorFunctions.has(importedName)) {
      throw new Error(`unsupported ontology authoring function: ${importedName}`);
    }
    imports.add(specifier.local.name);
  }
}

function parseBindings(
  declaration: VariableDeclaration,
  bindings: Map<string, BabelExpression>,
): void {
  if (declaration.kind !== "const") {
    throw new Error(".zoen.ts bindings must be const");
  }
  for (const binding of declaration.declarations) {
    if (
      binding.id.type !== "Identifier" ||
      binding.init === null ||
      !isExpression(binding.init)
    ) {
      throw new Error(".zoen.ts bindings require a name and initializer");
    }
    if (bindings.has(binding.id.name)) {
      throw new Error(`duplicate binding: ${binding.id.name}`);
    }
    bindings.set(binding.id.name, binding.init);
  }
}

function evaluate(
  expression: BabelExpression,
  bindings: ReadonlyMap<string, BabelExpression>,
  imports: ReadonlySet<string>,
  visiting: Set<string>,
): AuthorValue {
  if (expression.type === "ParenthesizedExpression") {
    return evaluate(expression.expression, bindings, imports, visiting);
  }
  if (expression.type === "StringLiteral") {
    return expression.value;
  }
  if (expression.type === "TemplateLiteral") {
    if (expression.expressions.length !== 0) {
      throw new Error("template interpolation is not supported");
    }
    const quasi = expression.quasis[0];
    if (quasi === undefined) {
      throw new Error("template literal has no content");
    }
    return quasi.value.cooked ?? quasi.value.raw;
  }
  if (expression.type === "NumericLiteral") {
    return expression.value;
  }
  if (expression.type === "BooleanLiteral") {
    return expression.value;
  }
  if (expression.type === "NullLiteral") {
    return null;
  }
  if (expression.type === "UnaryExpression") {
    if (
      expression.operator !== "-" ||
      expression.argument.type !== "NumericLiteral"
    ) {
      throw new Error("only negative numeric literals are supported");
    }
    return -expression.argument.value;
  }
  if (expression.type === "ArrayExpression") {
    return expression.elements.map((element) => {
      if (element === null || !isExpression(element)) {
        throw new Error("array holes and spreads are not supported");
      }
      return evaluate(element, bindings, imports, visiting);
    });
  }
  if (expression.type === "ObjectExpression") {
    const result: Record<string, AuthorValue> = {};
    for (const property of expression.properties) {
      if (
        property.type !== "ObjectProperty" ||
        property.computed ||
        !isExpression(property.value)
      ) {
        throw new Error("spreads and shorthand properties are not supported");
      }
      const name = propertyName(property.key);
      if (Object.hasOwn(result, name)) {
        throw new Error(`duplicate object key: ${name}`);
      }
      result[name] = evaluate(
        property.value,
        bindings,
        imports,
        visiting,
      );
    }
    return result;
  }
  if (expression.type === "Identifier") {
    const initializer = bindings.get(expression.name);
    if (initializer === undefined) {
      throw new Error(`unknown binding: ${expression.name}`);
    }
    if (visiting.has(expression.name)) {
      throw new Error(`cyclic binding: ${expression.name}`);
    }
    const nextVisiting = new Set(visiting);
    nextVisiting.add(expression.name);
    return evaluate(initializer, bindings, imports, nextVisiting);
  }
  if (expression.type === "CallExpression") {
    if (
      expression.callee.type !== "Identifier" ||
      !imports.has(expression.callee.name) ||
      expression.arguments.length !== 1
    ) {
      throw new Error("nondeterministic or unsupported syntax: CallExpression");
    }
    const argument = expression.arguments[0];
    if (argument === undefined || !isExpression(argument)) {
      throw new Error("ontology call argument is required");
    }
    return evaluate(argument, bindings, imports, visiting);
  }

  throw new Error(`nondeterministic or unsupported syntax: ${expression.type}`);
}

function propertyName(
  name: BabelExpression | Identifier | PrivateName,
): string {
  switch (name.type) {
    case "Identifier":
      return name.name;
    case "StringLiteral":
      return name.value;
    case "NumericLiteral":
      return String(name.value);
    default:
      throw new Error("computed property names are not supported");
  }
}

function validateBundle(bundle: RawDefinitionBundle): void {
  if (
    bundle.types.length === 0 ||
    bundle.relations.length === 0 ||
    bundle.computations.length === 0 ||
    bundle.actions.length === 0
  ) {
    throw new Error("a definition bundle must contain all four canonical families");
  }

  assertUniqueIds(bundle.types, "type");
  assertUniqueIds(bundle.relations, "relation");
  assertUniqueIds(bundle.computations, "computation");
  assertUniqueIds(bundle.actions, "action");

  const typeIds = new Set(bundle.types.map((definition) => definition.id));
  const relationIds = new Set(
    bundle.relations.map((definition) => definition.id),
  );

  for (const definition of bundle.types) {
    assertUniqueIds(definition.attributes, `attribute in ${definition.id}`);
  }
  for (const definition of bundle.relations) {
    if (!typeIds.has(definition.sourceType)) {
      throw new Error(
        `relation ${definition.id} references unknown source type ${definition.sourceType}`,
      );
    }
    if (
      definition.target.kind === "type" &&
      !typeIds.has(definition.target.typeId)
    ) {
      throw new Error(
        `relation ${definition.id} references unknown target type ${definition.target.typeId}`,
      );
    }
  }
  for (const definition of bundle.computations) {
    validateExecutable(definition.id, definition.inputs, definition.expression, relationIds);
  }
  for (const definition of bundle.actions) {
    assertUniqueBy(
      definition.effects,
      `effect in ${definition.id}`,
      (effect) => effect.relationId,
    );
    validateExecutable(definition.id, definition.inputs, definition.precondition, relationIds);
    for (const effect of definition.effects) {
      if (!relationIds.has(effect.relationId)) {
        throw new Error(
          `action ${definition.id} references unknown relation ${effect.relationId}`,
        );
      }
      validateExpression(
        effect.value,
        new Set(definition.inputs.map((input) => input.id)),
        relationIds,
        definition.id,
      );
    }
  }
}

function validateExecutable(
  id: string,
  inputs: readonly InputDefinition[],
  expression: Expression,
  relationIds: ReadonlySet<string>,
): void {
  assertUniqueIds(inputs, `input in ${id}`);
  validateExpression(
    expression,
    new Set(inputs.map((input) => input.id)),
    relationIds,
    id,
  );
}

function validateExpression(
  expression: Expression,
  inputIds: ReadonlySet<string>,
  relationIds: ReadonlySet<string>,
  ownerId: string,
): void {
  switch (expression.kind) {
    case "binary":
      validateExpression(expression.left, inputIds, relationIds, ownerId);
      validateExpression(expression.right, inputIds, relationIds, ownerId);
      return;
    case "input":
      if (!inputIds.has(expression.inputId)) {
        throw new Error(
          `${ownerId} references unknown input ${expression.inputId}`,
        );
      }
      return;
    case "literal":
      return;
    case "relation":
      if (!relationIds.has(expression.relationId)) {
        throw new Error(
          `${ownerId} references unknown relation ${expression.relationId}`,
        );
      }
      return;
    default: {
      const exhaustive: never = expression;
      return exhaustive;
    }
  }
}

function assertUniqueIds<T extends { readonly id: string }>(
  values: readonly T[],
  label: string,
): void {
  assertUniqueBy(values, label, (value) => value.id);
}

function assertUniqueBy<T>(
  values: readonly T[],
  label: string,
  getId: (value: T) => string,
): void {
  const ids = new Set<string>();
  for (const value of values) {
    const id = getId(value);
    if (ids.has(id)) {
      throw new Error(`duplicate ${label} id: ${id}`);
    }
    ids.add(id);
  }
}

function normalize(bundle: RawDefinitionBundle): CanonicalDefinitionBundle {
  return {
    actions: sortById(bundle.actions).map((definition) => ({
      effects: [...definition.effects]
        .sort((left, right) =>
          compareCodePoints(left.relationId, right.relationId),
        )
        .map((effect) => ({
          relationId: effect.relationId,
          value: copyExpression(effect.value),
        })),
      id: definition.id,
      inputs: normalizeInputs(definition.inputs),
      precondition: copyExpression(definition.precondition),
    })),
    computations: sortById(bundle.computations).map((definition) => ({
      expression: copyExpression(definition.expression),
      id: definition.id,
      inputs: normalizeInputs(definition.inputs),
      returns: copyValueType(definition.returns),
    })),
    definitionId: bundle.id,
    relations: sortById(bundle.relations).map((definition) => ({
      cardinality: definition.cardinality,
      id: definition.id,
      sourceType: definition.sourceType,
      target: copyRelationTarget(definition.target),
    })),
    revision: bundle.revision,
    schema: "zoen.definition.v1",
    types: sortById(bundle.types).map((definition) => ({
      attributes: normalizeInputs(definition.attributes),
      id: definition.id,
    })),
  };
}

function sortById<T extends { readonly id: string }>(
  values: readonly T[],
): T[] {
  return [...values].sort((left, right) =>
    compareCodePoints(left.id, right.id),
  );
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeInputs(
  inputs: readonly InputDefinition[],
): InputDefinition[] {
  return sortById(inputs).map((input) => ({
    id: input.id,
    valueType: copyValueType(input.valueType),
  }));
}

function copyRelationTarget(target: RelationTarget): RelationTarget {
  switch (target.kind) {
    case "type":
      return { kind: "type", typeId: target.typeId };
    case "value":
      return { kind: "value", valueType: copyValueType(target.valueType) };
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}

function copyValueType(valueType: ValueType): ValueType {
  switch (valueType.kind) {
    case "bool":
      return { kind: "bool" };
    case "decimal":
      return { kind: "decimal" };
    case "integer":
      return { kind: "integer" };
    case "quantity":
      return { kind: "quantity", unit: valueType.unit };
    case "text":
      return { kind: "text" };
    default: {
      const exhaustive: never = valueType;
      return exhaustive;
    }
  }
}

function copyExpression(expression: Expression): Expression {
  switch (expression.kind) {
    case "binary":
      return {
        kind: "binary",
        left: copyExpression(expression.left),
        operator: expression.operator,
        right: copyExpression(expression.right),
      };
    case "input":
      return { inputId: expression.inputId, kind: "input" };
    case "literal":
      return { kind: "literal", value: copyExactValue(expression.value) };
    case "relation":
      return { kind: "relation", relationId: expression.relationId };
    default: {
      const exhaustive: never = expression;
      return exhaustive;
    }
  }
}

function copyExactValue(value: ExactValue): ExactValue {
  switch (value.kind) {
    case "bool":
      return { kind: "bool", value: value.value };
    case "decimal":
      return { kind: "decimal", value: value.value };
    case "integer":
      return { kind: "integer", value: value.value };
    case "quantity":
      return { amount: value.amount, kind: "quantity", unit: value.unit };
    case "text":
      return { kind: "text", value: value.value };
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function isCanonicalDecimal(value: string): boolean {
  return /^(0|-[1-9][0-9]*|[1-9][0-9]*|-?0\.[0-9]*[1-9]|-?[1-9][0-9]*\.[0-9]*[1-9])$/.test(
    value,
  );
}
