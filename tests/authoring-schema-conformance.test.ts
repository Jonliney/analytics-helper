import assert from "node:assert/strict";
import test from "node:test";

import { Ajv, type AnySchema } from "ajv";

import {
  authoredEventDefinitionFileSchema,
  renderEventDefinitionJsonSchema,
} from "../tooling/authoring-schema.js";

const baseEvent = {
  name: "Signup Completed",
  description: "A user completes registration",
  owner: "growth",
  properties: {},
};

const cases: readonly Readonly<{
  name: string;
  value: unknown;
  valid: boolean;
}>[] = [
  { name: "one event", value: baseEvent, valid: true },
  {
    name: "an event array",
    value: [baseEvent, { ...baseEvent, name: "Signup Started" }],
    valid: true,
  },
  { name: "an empty event array", value: [], valid: false },
  {
    name: "an event without an owner",
    value: { ...baseEvent, owner: undefined },
    valid: false,
  },
  {
    name: "a snake_case event name",
    value: { ...baseEvent, name: "signup_completed" },
    valid: true,
  },
  {
    name: "mixed established event-name styles",
    value: [
      baseEvent,
      { ...baseEvent, name: "signup_started" },
      { ...baseEvent, name: "passwordResetRequested" },
      { ...baseEvent, name: "auth:signup-started" },
    ],
    valid: true,
  },
  {
    name: "an empty event name",
    value: { ...baseEvent, name: "" },
    valid: false,
  },
  {
    name: "an event name with surrounding whitespace",
    value: { ...baseEvent, name: " Signup Completed " },
    valid: false,
  },
  {
    name: "an invalid owner",
    value: { ...baseEvent, owner: "Growth Team" },
    valid: false,
  },
  {
    name: "an empty description",
    value: { ...baseEvent, description: "" },
    valid: false,
  },
  {
    name: "an undeclared event field",
    value: { ...baseEvent, unexpected: true },
    valid: false,
  },
  {
    name: "a valid property of each scalar type",
    value: {
      ...baseEvent,
      properties: {
        method: { type: "string", optional: true },
        attempt_number: { type: "number" },
        is_invited: { type: "boolean" },
      },
    },
    valid: true,
  },
  {
    name: "a non-snake-case property name",
    value: {
      ...baseEvent,
      properties: { campaignId: { type: "string" } },
    },
    valid: false,
  },
  {
    name: "an unsupported property type",
    value: {
      ...baseEvent,
      properties: { created_at: { type: "date" } },
    },
    valid: false,
  },
  {
    name: "enum values on a number property",
    value: {
      ...baseEvent,
      properties: { attempt_number: { type: "number", enum: ["one"] } },
    },
    valid: false,
  },
  {
    name: "an empty string enum",
    value: {
      ...baseEvent,
      properties: { method: { type: "string", enum: [] } },
    },
    valid: false,
  },
  {
    name: "duplicate string enum values",
    value: {
      ...baseEvent,
      properties: { method: { type: "string", enum: ["email", "email"] } },
    },
    valid: false,
  },
  {
    name: "an open enum",
    value: {
      ...baseEvent,
      properties: {
        method: {
          type: "string",
          enum: ["email", "google"],
          allowOtherValues: true,
        },
      },
    },
    valid: true,
  },
  {
    name: "allowOtherValues without an enum",
    value: {
      ...baseEvent,
      properties: { method: { type: "string", allowOtherValues: true } },
    },
    valid: false,
  },
  {
    name: "a deprecated event",
    value: {
      ...baseEvent,
      status: "deprecated",
      deprecatedSince: "2026-09-01",
      replacement: "Signup Started",
    },
    valid: true,
  },
  {
    name: "a deprecated event without a date",
    value: { ...baseEvent, status: "deprecated" },
    valid: false,
  },
  {
    name: "an active event with deprecation metadata",
    value: {
      ...baseEvent,
      status: "active",
      deprecatedSince: "2026-09-01",
    },
    valid: false,
  },
  {
    name: "an impossible deprecation date",
    value: {
      ...baseEvent,
      status: "deprecated",
      deprecatedSince: "2026-02-30",
    },
    valid: false,
  },
  {
    name: "a replacement event name with surrounding whitespace",
    value: {
      ...baseEvent,
      status: "deprecated",
      deprecatedSince: "2026-09-01",
      replacement: " signup_started",
    },
    valid: false,
  },
];

test("Zod and the generated Draft-07 schema accept the same definitions", () => {
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    formats: { date: true },
  });
  const validateJsonSchema = ajv.compile(
    JSON.parse(renderEventDefinitionJsonSchema()) as AnySchema,
  );

  for (const fixture of cases) {
    const zodResult = authoredEventDefinitionFileSchema.safeParse(
      fixture.value,
    );
    const jsonSchemaResult = validateJsonSchema(fixture.value);

    assert.equal(
      zodResult.success,
      fixture.valid,
      `${fixture.name}: Zod returned ${zodResult.success}`,
    );
    assert.equal(
      jsonSchemaResult,
      fixture.valid,
      `${fixture.name}: JSON Schema returned ${jsonSchemaResult}; ${ajv.errorsText(validateJsonSchema.errors)}`,
    );
  }
});
