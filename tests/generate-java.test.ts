import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadEventCatalog } from "../tooling/event-catalog.js";
import { renderJavaCatalog } from "../tooling/generate-java.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("generates typed Java records from the shared catalog", () => {
  const output = renderJavaCatalog(loadEventCatalog(repositoryRoot).events);

  assert.match(output, /sealed interface Event permits SignupCompleted, SignupStarted/);
  assert.match(output, /record SignupCompleted\(/);
  assert.match(output, /SignupCompletedMethodValue method/);
  assert.match(output, /record SignupStarted\(String method, Map<String, Object> additionalProperties\)/);
  assert.match(output, /METHOD_RECOMMENDED_VALUES/);
  assert.match(output, /return "Signup Completed"/);
});

test("rejects Java class-name collisions", () => {
  const event = loadEventCatalog(repositoryRoot).events[0]!;

  assert.throws(
    () =>
      renderJavaCatalog([
        { ...event, definition: { ...event.definition, name: "Sign Up" } },
        { ...event, definition: { ...event.definition, name: "Sign-Up" } },
      ]),
    /Java class name collision/,
  );
});

test("rejects Java property-name collisions", () => {
  const event = loadEventCatalog(repositoryRoot).events[0]!;

  assert.throws(
    () =>
      renderJavaCatalog([
        {
          ...event,
          definition: {
            ...event.definition,
            properties: {
              class: { type: "string" },
              class_value: { type: "string" },
            },
          },
        },
      ]),
    /Java property name collision/,
  );
});
