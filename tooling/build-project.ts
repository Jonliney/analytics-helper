import fs from "node:fs";
import path from "node:path";

import { renderEventDefinitionJsonSchema } from "./authoring-schema.js";
import type { EventDefinition } from "./event-catalog.js";
import { loadEventCatalog } from "./event-catalog.js";
import {
  renderLanguageNeutralCatalog,
  renderTypeScriptCatalog,
} from "./generate-catalog.js";
import { renderJavaCatalog } from "./generate-java.js";

type OutputTarget = Readonly<{
  relativePath: string;
  render: (events: readonly EventDefinition[]) => string;
}>;

const OUTPUT_TARGETS: readonly OutputTarget[] = [
  {
    relativePath: "event-definition.schema.json",
    render: renderEventDefinitionJsonSchema,
  },
  {
    relativePath: "src/generated/analytics-events.ts",
    render: renderTypeScriptCatalog,
  },
  {
    relativePath: "generated/analytics-catalog.json",
    render: renderLanguageNeutralCatalog,
  },
  {
    relativePath:
      "generated/java/com/company/analytics/AnalyticsEvents.java",
    render: renderJavaCatalog,
  },
];

export type AnalyticsBuildResult = Readonly<{
  eventCount: number;
  artifacts: readonly string[];
}>;

/**
 * Validates the project, renders every target in memory, then writes the outputs.
 * A renderer failure therefore cannot leave an internally inconsistent build.
 */
export function buildAnalyticsProject(
  rootDirectory: string,
): AnalyticsBuildResult {
  const catalog = loadEventCatalog(rootDirectory);
  const artifacts = OUTPUT_TARGETS.map((target) => ({
    relativePath: target.relativePath,
    contents: target.render(catalog.events),
  }));

  for (const artifact of artifacts) {
    const outputPath = path.join(rootDirectory, artifact.relativePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, artifact.contents);
  }

  return {
    eventCount: catalog.events.length,
    artifacts: artifacts.map(({ relativePath }) => relativePath),
  };
}
