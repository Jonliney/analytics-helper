import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadEventCatalog } from "../tooling/event-catalog.js";
import { renderTypeScriptCatalog } from "../tooling/generate-catalog.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const events = loadEventCatalog(repositoryRoot).events;

test("marks deprecated TypeScript event exports", () => {
  const event = events.find(({ name }) => name === "signup_started")!;
  const output = renderTypeScriptCatalog([
    {
      ...event,
      status: "deprecated",
      deprecatedSince: "2026-09-01",
      replacement: "Signup Completed",
    },
  ]);

  assert.match(
    output,
    /@deprecated Since 2026-09-01\. Use Signup Completed instead\./,
  );
  assert.match(
    output,
    /@deprecated Since 2026-09-01\. Use Signup Completed instead\.\n\s+\*\/\n\s+signupStarted: "signup_started"/,
  );
  assert.match(output, /status: "deprecated"/);
  assert.match(output, /deprecatedSince: "2026-09-01"/);
  assert.match(output, /replacement: "Signup Completed"/);
});

test("preserves suggestions for open string enums", () => {
  const output = renderTypeScriptCatalog(events);

  assert.match(
    output,
    /z\.string\(\) as z\.ZodType<"email" \| "google" \| "apple" \| \(string & \{\}\), string>/,
  );
});

test("rejects colliding TypeScript event constant names", () => {
  const event = events[0]!;

  assert.throws(
    () =>
      renderTypeScriptCatalog([
        { ...event, name: "Sign Up", domain: undefined },
        { ...event, name: "sign_up", domain: undefined },
      ]),
    /eventNames key collision at the root/,
  );
});

test("rejects event names that cannot form a TypeScript identifier", () => {
  assert.throws(
    () => renderTypeScriptCatalog([{ ...events[0]!, name: "🔥" }]),
    /cannot generate an eventNames key.*explicit lower-camel "key"/,
  );
});

test("groups event names by optional domain and supports key overrides", () => {
  const event = events[0]!;
  const output = renderTypeScriptCatalog([
    { ...event, name: "Application Opened", domain: undefined },
    { ...event, name: "Signup Completed", domain: "auth" },
    {
      ...event,
      name: "Registration Finalized",
      domain: "auth",
      key: "signupFinished",
    },
  ]);

  assert.match(output, /applicationOpened: "Application Opened"/);
  assert.match(output, /auth: \{/);
  assert.match(output, /signupCompleted: "Signup Completed"/);
  assert.match(output, /signupFinished: "Registration Finalized"/);
});

test("accepts an explicit key when the event name cannot form one", () => {
  const output = renderTypeScriptCatalog([
    { ...events[0]!, name: "🔥", key: "fire", domain: undefined },
  ]);

  assert.match(output, /fire: "🔥"/);
});
