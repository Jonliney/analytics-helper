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

function deprecationMessage(event: EventDefinition): string | undefined {
  if (event.status !== "deprecated") {
    return undefined;
  }

  return `Since ${event.deprecatedSince}.${
    event.replacement ? ` Use ${event.replacement} instead.` : ""
  }`;
}

export function renderTypeScriptCatalog(
  events: readonly EventDefinition[],
): string {
  const schemas = events
    .map((event) => {
      const deprecation = deprecationMessage(event);

      return `  /**
${commentLines(event.description)}
   * Owner: ${event.owner.replaceAll("*/", "*\\/")}
${deprecation ? `   * @deprecated ${deprecation}\n` : ""}   */
  ${JSON.stringify(event.name)}: ${eventToZod(event)},`;
    })
    .join("\n");

  const definitions = events
    .map((event) => {
      const deprecation = deprecationMessage(event);

      return `${
        deprecation
          ? `  /** @deprecated ${deprecation} */\n`
          : ""
      }  ${JSON.stringify(event.name)}: {
    description: ${JSON.stringify(event.description)},
    owner: ${JSON.stringify(event.owner)},
    status: ${JSON.stringify(event.status)},${
      event.status === "deprecated"
        ? `
    deprecatedSince: ${JSON.stringify(event.deprecatedSince)},${
      event.replacement
        ? `
    replacement: ${JSON.stringify(event.replacement)},`
        : ""
    }`
        : ""
    }
  },`;
    })
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
