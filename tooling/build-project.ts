import fs from "node:fs";
import path from "node:path";

import {
  renderEventDefinitionJsonSchema,
  renderPropertySetDefinitionJsonSchema,
} from "./authoring-schema.js";
import { loadEventCatalog, type EventCatalog } from "./event-catalog.js";
import {
  renderLanguageNeutralCatalog,
  renderTypeScriptCatalog,
} from "./generate-catalog.js";
import { renderJavaCatalog } from "./generate-java.js";

type OutputTarget = Readonly<{
  relativePath: string;
  render: (catalog: EventCatalog) => string;
}>;

const OUTPUT_TARGETS: readonly OutputTarget[] = [
  {
    relativePath: "event-definition.schema.json",
    render: () => renderEventDefinitionJsonSchema(),
  },
  {
    relativePath: "property-set-definition.schema.json",
    render: () => renderPropertySetDefinitionJsonSchema(),
  },
  {
    relativePath: "src/generated/analytics-events.ts",
    render: ({ events }) => renderTypeScriptCatalog(events),
  },
  {
    relativePath: "generated/analytics-catalog.json",
    render: ({ events, propertySets }) =>
      renderLanguageNeutralCatalog(events, propertySets),
  },
  {
    relativePath:
      "generated/java/com/company/analytics/AnalyticsEvents.java",
    render: ({ events }) => renderJavaCatalog(events),
  },
];

export type AnalyticsBuildResult = Readonly<{
  eventCount: number;
  propertySetCount: number;
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
    contents: target.render(catalog),
  }));

  for (const artifact of artifacts) {
    const outputPath = path.join(rootDirectory, artifact.relativePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, artifact.contents);
  }

  return {
    eventCount: catalog.events.length,
    propertySetCount: catalog.propertySets.length,
    artifacts: artifacts.map(({ relativePath }) => relativePath),
  };
}
