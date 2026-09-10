import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadEventCatalog } from "../tooling/event-catalog.js";
import { renderTypeScriptCatalog } from "../tooling/generate-catalog.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const events = loadEventCatalog(repositoryRoot).events;

test("marks deprecated TypeScript event exports", () => {
  const event = events.find(({ name }) => name === "Signup Started")!;
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
  assert.match(output, /status: "deprecated"/);
  assert.match(output, /deprecatedSince: "2026-09-01"/);
  assert.match(output, /replacement: "Signup Completed"/);
});
