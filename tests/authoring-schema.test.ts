import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  parseAuthoredEventDefinitionFile,
  parseAuthoredPropertySetDefinitionFile,
  parseAuthoredUserTraitsDefinition,
  parseAuthoredViewDefinitionFile,
  renderEventDefinitionJsonSchema,
  renderPropertySetDefinitionJsonSchema,
  renderUserTraitsDefinitionJsonSchema,
  renderViewDefinitionJsonSchema,
} from "../tooling/authoring-schema.js";
import { validEvent } from "./catalog-fixture.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("applies authoring defaults from the schema", () => {
  const parsed = parseAuthoredEventDefinitionFile(validEvent);
  assert.equal(Array.isArray(parsed), false);

  if (Array.isArray(parsed)) {
    return;
  }

  assert.equal(parsed.allowAdditionalProperties, false);
  assert.equal(parsed.status, "active");
  assert.equal(parsed.domain, undefined);
  assert.equal(parsed.key, "signupCompleted");
  assert.deepEqual(parsed.propertySets, []);
  assert.equal(parsed.properties.method?.optional, false);
  assert.equal(parsed.properties.method?.allowOtherValues, false);
});

test("normalizes reusable property set definitions", () => {
  const parsed = parseAuthoredPropertySetDefinitionFile({
    name: "session_context",
    description: "Properties identifying the current session",
    properties: {
      session_id: { type: "string" },
    },
  });

  assert.equal(Array.isArray(parsed), false);
  if (!Array.isArray(parsed)) {
    assert.equal(parsed.name, "session_context");
    assert.equal(parsed.properties.session_id?.optional, false);
    assert.equal(parsed.properties.session_id?.allowOtherValues, false);
  }
});

test("normalizes view definitions and user traits", () => {
  const view = parseAuthoredViewDefinitionFile({
    name: "Settings",
    key: "settings",
    description: "User views settings",
    properties: {
      section: { type: "string", optional: true },
    },
  });
  const userTraits = parseAuthoredUserTraitsDefinition({
    description: "Durable user traits",
    traits: {
      plan: { type: "string", enum: ["free", "pro"], optional: true },
    },
  });

  assert.equal(Array.isArray(view), false);
  if (!Array.isArray(view)) {
    assert.equal(view.allowAdditionalProperties, false);
    assert.equal(view.properties.section?.optional, true);
  }
  assert.equal(userTraits.allowAdditionalTraits, false);
  assert.equal(userTraits.traits.plan?.allowOtherValues, false);
});

test("preserves generated API identifiers", () => {
  const parsed = parseAuthoredEventDefinitionFile({
    ...validEvent,
    domain: "accountSettings",
    key: "registrationFinished",
  });

  assert.equal(Array.isArray(parsed), false);
  if (!Array.isArray(parsed)) {
    assert.equal(parsed.domain, "accountSettings");
    assert.equal(parsed.key, "registrationFinished");
  }
});

test("preserves optional event purpose", () => {
  const parsed = parseAuthoredEventDefinitionFile({
    ...validEvent,
    purpose: "Measure registration conversion",
  });

  assert.equal(Array.isArray(parsed), false);
  if (!Array.isArray(parsed)) {
    assert.equal(parsed.purpose, "Measure registration conversion");
  }
});

test("normalizes deprecated lifecycle metadata", () => {
  const parsed = parseAuthoredEventDefinitionFile({
    ...validEvent,
    status: "deprecated",
    deprecatedSince: "2026-09-01",
    replacement: "Signup Started",
  });

  assert.equal(Array.isArray(parsed), false);
  if (!Array.isArray(parsed)) {
    assert.equal(parsed.status, "deprecated");
    assert.equal(parsed.deprecatedSince, "2026-09-01");
    assert.equal(parsed.replacement, "Signup Started");
  }
});

test("keeps the checked-in JSON Schema generated from the authoring schema", () => {
  const generatedSchema = renderEventDefinitionJsonSchema();
  const checkedInSchema = fs.readFileSync(
    path.join(repositoryRoot, "event-definition.schema.json"),
    "utf8",
  );

  assert.equal(checkedInSchema, generatedSchema);
  assert.doesNotMatch(generatedSchema, /"readOnly"/);
  assert.match(generatedSchema, /"uniqueItems": true/);
  assert.match(generatedSchema, /"allowOtherValues": \[\s*"enum"/);
  assert.match(generatedSchema, /"deprecatedSince"/);
  assert.match(generatedSchema, /"domain"/);
  assert.match(generatedSchema, /"key"/);
});

test("keeps the property set JSON Schema generated from the authoring schema", () => {
  const generatedSchema = renderPropertySetDefinitionJsonSchema();
  const checkedInSchema = fs.readFileSync(
    path.join(repositoryRoot, "property-set-definition.schema.json"),
    "utf8",
  );

  assert.equal(checkedInSchema, generatedSchema);
  assert.doesNotMatch(generatedSchema, /"readOnly"/);
  assert.match(generatedSchema, /"propertySetDefinition"/);
  assert.match(generatedSchema, /"uniqueItems": true/);
});

test("keeps the view JSON Schema generated from the authoring schema", () => {
  const generatedSchema = renderViewDefinitionJsonSchema();
  const checkedInSchema = fs.readFileSync(
    path.join(repositoryRoot, "view-definition.schema.json"),
    "utf8",
  );

  assert.equal(checkedInSchema, generatedSchema);
  assert.match(generatedSchema, /"viewDefinition"/);
  assert.match(generatedSchema, /"allowAdditionalProperties"/);
});

test("keeps the user-trait JSON Schema generated from the authoring schema", () => {
  const generatedSchema = renderUserTraitsDefinitionJsonSchema();
  const checkedInSchema = fs.readFileSync(
    path.join(repositoryRoot, "user-traits-definition.schema.json"),
    "utf8",
  );

  assert.equal(checkedInSchema, generatedSchema);
  assert.match(generatedSchema, /"userTraitsDefinition"/);
  assert.match(generatedSchema, /"allowAdditionalTraits"/);
});
