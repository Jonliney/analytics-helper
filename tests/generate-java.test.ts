import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadEventCatalog } from "../tooling/event-catalog.js";
import { renderJavaCatalog } from "../tooling/generate-java.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const events = loadEventCatalog(repositoryRoot).events;

test("generates typed Java records from the shared catalog", () => {
  const output = renderJavaCatalog(events);

  assert.match(
    output,
    /sealed interface Event permits SignupCompleted, SignupStarted/,
  );
  assert.match(output, /record SignupCompleted\(/);
  assert.match(output, /SignupCompletedMethodValue method/);
  assert.match(
    output,
    /record SignupStarted\(String method, Map<String, Object> additionalProperties\)/,
  );
  assert.match(output, /METHOD_RECOMMENDED_VALUES/);
  assert.match(output, /return "Signup Completed"/);
});

test("annotates deprecated Java event records", () => {
  const event = events.find(({ name }) => name === "signup_started")!;
  const output = renderJavaCatalog([
    {
      ...event,
      status: "deprecated",
      deprecatedSince: "2026-09-01",
      replacement: "Signup Completed",
    },
    events.find(({ name }) => name === "Signup Completed")!,
  ]);

  assert.match(output, /@deprecated Since 2026-09-01\./);
  assert.match(output, /Use \{@link SignupCompleted\} instead\./);
  assert.match(output, /@Deprecated\(since = "2026-09-01"\)/);
});

test("rejects Java class-name collisions", () => {
  const event = events[0]!;

  assert.throws(
    () =>
      renderJavaCatalog([
        { ...event, name: "2FA Started" },
        { ...event, name: "2 FA Started" },
      ]),
    /Java class name collision/,
  );
});

test("rejects Java property-name collisions", () => {
  const event = events[0]!;

  assert.throws(
    () =>
      renderJavaCatalog([
        {
          ...event,
          properties: {
            class: {
              type: "string",
              optional: false,
              allowOtherValues: false,
            },
            class_value: {
              type: "string",
              optional: false,
              allowOtherValues: false,
            },
          },
        },
      ]),
    /Java property name collision/,
  );
});
