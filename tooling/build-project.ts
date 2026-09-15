import fs from "node:fs";
import path from "node:path";

import {
  renderEventDefinitionJsonSchema,
  renderPropertySetDefinitionJsonSchema,
  renderUserTraitsDefinitionJsonSchema,
  renderViewDefinitionJsonSchema,
} from "./authoring-schema.js";
import { loadEventCatalog, type EventCatalog } from "./event-catalog.js";
import {
  renderLanguageNeutralCatalog,
  renderTypeScriptCatalog,
} from "./generate-catalog.js";

type OutputTarget = Readonly<{
  relativePath: string;
  render: (catalog: EventCatalog) => string;
}>;

const OUTPUT_TARGETS: readonly OutputTarget[] = [
  {
    relativePath: "generated/schemas/event-definition.schema.json",
    render: () => renderEventDefinitionJsonSchema(),
  },
  {
    relativePath: "generated/schemas/property-set-definition.schema.json",
    render: () => renderPropertySetDefinitionJsonSchema(),
  },
  {
    relativePath: "generated/schemas/user-traits-definition.schema.json",
    render: () => renderUserTraitsDefinitionJsonSchema(),
  },
  {
    relativePath: "generated/schemas/view-definition.schema.json",
    render: () => renderViewDefinitionJsonSchema(),
  },
  {
    relativePath: "src/generated/analytics-events.ts",
    render: ({ events, views, userTraits }) =>
      renderTypeScriptCatalog(events, views, userTraits),
  },
  {
    relativePath: "generated/analytics-catalog.json",
    render: ({ events, propertySets, views, userTraits }) =>
      renderLanguageNeutralCatalog(events, propertySets, views, userTraits),
  },
];

export type AnalyticsBuildResult = Readonly<{
  eventCount: number;
  propertySetCount: number;
  viewCount: number;
  hasUserTraits: boolean;
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
    viewCount: catalog.views.length,
    hasUserTraits: catalog.userTraits !== undefined,
    artifacts: artifacts.map(({ relativePath }) => relativePath),
  };
}
