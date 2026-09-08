import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { loadEventCatalog } from "../tooling/event-catalog.js";
import {
  renderLanguageNeutralCatalog,
  renderTypeScriptCatalog,
} from "../tooling/generate-catalog.js";
import { renderJavaCatalog } from "../tooling/generate-java.js";

const eventCount = Number.parseInt(
  process.env.ANALYTICS_BENCHMARK_EVENTS ?? "300",
  10,
);

if (!Number.isSafeInteger(eventCount) || eventCount < 1) {
  throw new Error("ANALYTICS_BENCHMARK_EVENTS must be a positive integer");
}
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "analytics-benchmark-"),
);
const eventsDirectory = path.join(fixtureRoot, "events");

fs.mkdirSync(eventsDirectory, { recursive: true });
fs.cpSync(
  path.join(repositoryRoot, "event-definition.schema.json"),
  path.join(fixtureRoot, "event-definition.schema.json"),
);

for (let index = 0; index < eventCount; index += 1) {
  fs.writeFileSync(
    path.join(eventsDirectory, `event-${index}.json`),
    JSON.stringify({
      name: `Benchmark Event ${index}`,
      description: `Synthetic benchmark event ${index}`,
      owner: "benchmark",
      properties: {
        identifier: { type: "string" },
        source: { type: "string", enum: ["web", "mobile", "server"] },
        duration_ms: { type: "number", optional: true },
        successful: { type: "boolean" },
      },
    }),
  );
}

try {
  const validationStarted = performance.now();
  const catalog = loadEventCatalog(fixtureRoot);
  const validationMs = performance.now() - validationStarted;

  const generationStarted = performance.now();
  const typescript = renderTypeScriptCatalog(catalog.events);
  const java = renderJavaCatalog(catalog.events);
  const json = renderLanguageNeutralCatalog(catalog.events);
  const generationMs = performance.now() - generationStarted;

  console.log(`${eventCount} events across ${eventCount} files`);
  console.log(`Validation: ${validationMs.toFixed(1)} ms`);
  console.log(`Generation: ${generationMs.toFixed(1)} ms`);
  console.log(`TypeScript: ${(typescript.length / 1024).toFixed(1)} KiB`);
  console.log(`Java: ${(java.length / 1024).toFixed(1)} KiB`);
  console.log(`Catalog JSON: ${(json.length / 1024).toFixed(1)} KiB`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
