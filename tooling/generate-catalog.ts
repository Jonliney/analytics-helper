import type {
  EventDefinition,
  LoadedEventDefinition,
  PropertyDefinition,
} from "./event-catalog.js";

function propertyToZod(property: PropertyDefinition): string {
  if (property.enum) {
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

  return `z.strictObject({${properties ? `\n${properties}\n  ` : ""}})`;
}

function commentLines(value: string): string {
  return value
    .replaceAll("*/", "*\\/")
    .split(/\r?\n/)
    .map((line) => `   * ${line}`)
    .join("\n");
}

export function renderTypeScriptCatalog(
  events: LoadedEventDefinition[],
): string {
  const schemas = events
    .map(
      ({ definition }) => `  /**
${commentLines(definition.description)}
   * Owner: ${definition.owner.replaceAll("*/", "*\\/")}
   */
  ${JSON.stringify(definition.name)}: ${eventToZod(definition)},`,
    )
    .join("\n");

  const definitions = events
    .map(
      ({ definition }) =>
        `  ${JSON.stringify(definition.name)}: {
    description: ${JSON.stringify(definition.description)},
    owner: ${JSON.stringify(definition.owner)},
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
  events: LoadedEventDefinition[],
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      events: events.map(({ definition }) => definition),
    },
    null,
    2,
  )}\n`;
}
