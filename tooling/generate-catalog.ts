import type {
  EventDefinition,
  PropertyDefinition,
} from "./event-catalog.js";

function propertyToZod(property: PropertyDefinition): string {
  if (property.enum && !property.allowOtherValues) {
    return `z.enum([${property.enum.map((value) => JSON.stringify(value)).join(", ")}])`;
  }

  switch (property.type) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
  }
}

function eventToZod(event: EventDefinition): string {
  const properties = Object.entries(event.properties)
    .map(([name, definition]) => {
      const schema = `${propertyToZod(definition)}${definition.optional ? ".optional()" : ""}`;
      const description = definition.description
        ? `.describe(${JSON.stringify(definition.description)})`
        : "";

      return `    ${JSON.stringify(name)}: ${schema}${description},`;
    })
    .join("\n");

  const objectSchema = event.allowAdditionalProperties
    ? "z.object"
    : "z.strictObject";
  const additionalProperties = event.allowAdditionalProperties
    ? ".catchall(z.unknown())"
    : "";

  return `${objectSchema}({${properties ? `\n${properties}\n  ` : ""}})${additionalProperties}`;
}

function commentLines(value: string): string {
  return value
    .replaceAll("*/", "*\\/")
    .split(/\r?\n/)
    .map((line) => `   * ${line}`)
    .join("\n");
}

export function renderTypeScriptCatalog(
  events: readonly EventDefinition[],
): string {
  const schemas = events
    .map(
      (event) => `  /**
${commentLines(event.description)}
   * Owner: ${event.owner.replaceAll("*/", "*\\/")}
   */
  ${JSON.stringify(event.name)}: ${eventToZod(event)},`,
    )
    .join("\n");

  const definitions = events
    .map(
      (event) =>
        `  ${JSON.stringify(event.name)}: {
    description: ${JSON.stringify(event.description)},
    owner: ${JSON.stringify(event.owner)},
  },`,
    )
    .join("\n");

  return `// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY. Edit events/**/*.json and run pnpm generate.

import { z } from "zod";

export const eventSchemas = {
${schemas}
} as const;

export const eventDefinitions = {
${definitions}
} as const;

export type AnalyticsEventName = keyof typeof eventSchemas;

export type AnalyticsEvents = {
  [Name in AnalyticsEventName]: z.infer<(typeof eventSchemas)[Name]>;
};

export type AnalyticsEvent = {
  [Name in AnalyticsEventName]: {
    name: Name;
    properties: AnalyticsEvents[Name];
  };
}[AnalyticsEventName];
`;
}

export function renderLanguageNeutralCatalog(
  events: readonly EventDefinition[],
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      events,
    },
    null,
    2,
  )}\n`;
}
