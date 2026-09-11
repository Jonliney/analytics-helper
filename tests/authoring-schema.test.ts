import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  parseAuthoredEventDefinitionFile,
  renderEventDefinitionJsonSchema,
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
  assert.equal(parsed.key, undefined);
  assert.equal(parsed.properties.method?.optional, false);
  assert.equal(parsed.properties.method?.allowOtherValues, false);
});

test("preserves optional generated API identifiers", () => {
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
