import type {
  EventDefinition,
  PropertyDefinition,
  PropertySetDefinition,
} from "./event-catalog.js";
import {
  resolveEventNameHierarchy,
  type ResolvedEventIdentifier,
} from "./event-identifiers.js";

function propertyToZod(property: PropertyDefinition): string {
  if (property.enum && !property.allowOtherValues) {
    return `z.enum([${property.enum.map((value) => JSON.stringify(value)).join(", ")}])`;
  }

  if (property.enum && property.allowOtherValues) {
    const recommendedValues = property.enum
      .map((value) => JSON.stringify(value))
      .join(" | ");

    return `(z.string() as z.ZodType<${recommendedValues} | (string & {}), string>)`;
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

function commentLines(value: string, indentation = "  "): string {
  return value
    .replaceAll("*/", "*\\/")
    .split(/\r?\n/)
    .map((line) => `${indentation} * ${line}`)
    .join("\n");
}

function deprecationMessage(
  event: Readonly<{ status: "active" }> | Readonly<{
    status: "deprecated";
    deprecatedSince: string;
    replacement?: string;
  }>,
): string | undefined {
  if (event.status !== "deprecated") {
    return undefined;
  }

  return `Since ${event.deprecatedSince}.${
    event.replacement ? ` Use ${event.replacement} instead.` : ""
  }`;
}

function renderEventNameEntry(
  resolved: ResolvedEventIdentifier,
  indentation: string,
): string {
  const deprecation = deprecationMessage(resolved.event);

  return `${indentation}/**
${commentLines(resolved.event.description, indentation)}
${deprecation ? `${indentation} * @deprecated ${deprecation}\n` : ""}${indentation} */
${indentation}${resolved.key}: ${JSON.stringify(resolved.event.name)},`;
}

function renderEventNameConstants(events: readonly EventDefinition[]): string {
  const hierarchy = resolveEventNameHierarchy(events);
  const rootEntries = hierarchy.root.map((event) =>
    renderEventNameEntry(event, "  "),
  );
  const domainEntries = [...hierarchy.domains].map(
    ([domain, domainEvents]) => `  ${domain}: {
${domainEvents.map((event) => renderEventNameEntry(event, "    ")).join("\n")}
  },`,
  );

  return [...rootEntries, ...domainEntries].join("\n");
}

export function renderTypeScriptCatalog(
  events: readonly EventDefinition[],
): string {
  const eventNames = renderEventNameConstants(events);
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
${event.domain ? `    domain: ${JSON.stringify(event.domain)},\n` : ""}${event.key ? `    key: ${JSON.stringify(event.key)},\n` : ""}${event.propertySets.length > 0 ? `    propertySets: ${JSON.stringify(event.propertySets)},\n` : ""}    status: ${JSON.stringify(event.status)},${
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

export const eventNames = {
${eventNames}
} as const;

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
  propertySets: readonly PropertySetDefinition[] = [],
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 2,
      propertySets,
      events,
    },
    null,
    2,
  )}\n`;
}
