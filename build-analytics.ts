import fs from "node:fs";
import path from "node:path";

import { loadEventCatalog } from "./tooling/event-catalog.js";
import {
  renderLanguageNeutralCatalog,
  renderTypeScriptCatalog,
} from "./tooling/generate-catalog.js";

const rootDirectory = process.cwd();
const typescriptOutput = path.join(
  rootDirectory,
  "src/generated/analytics-events.ts",
);
const catalogOutput = path.join(
  rootDirectory,
  "generated/analytics-catalog.json",
);

try {
  const catalog = loadEventCatalog(rootDirectory);

  fs.mkdirSync(path.dirname(typescriptOutput), { recursive: true });
  fs.mkdirSync(path.dirname(catalogOutput), { recursive: true });
  fs.writeFileSync(typescriptOutput, renderTypeScriptCatalog(catalog.events));
  fs.writeFileSync(
    catalogOutput,
    renderLanguageNeutralCatalog(catalog.events),
  );

  console.log(
    `Generated ${catalog.events.length} analytics event${catalog.events.length === 1 ? "" : "s"}:`,
  );
  console.log(`  ${path.relative(rootDirectory, typescriptOutput)}`);
  console.log(`  ${path.relative(rootDirectory, catalogOutput)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
