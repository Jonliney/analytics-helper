import type {
  EventDefinition,
  PropertyDefinition,
  PropertySetDefinition,
  UserTraitsDefinition,
  ViewDefinition,
} from "./event-catalog.js";
import {
  resolveEventNameHierarchy,
  type ResolvedEventIdentifier,
} from "./event-identifiers.js";

export const LANGUAGE_NEUTRAL_CATALOG_SCHEMA_VERSION = 2;

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

function propertiesToZod(
  propertiesDefinition: Readonly<Record<string, PropertyDefinition>>,
  allowAdditionalProperties: boolean,
  propertyIndentation = "    ",
): string {
  const properties = Object.entries(propertiesDefinition)
    .map(([name, definition]) => {
      const schema = `${propertyToZod(definition)}${definition.optional ? ".optional()" : ""}`;
      const description = definition.description
        ? `.describe(${JSON.stringify(definition.description)})`
        : "";

      return `${propertyIndentation}${JSON.stringify(name)}: ${schema}${description},`;
    })
    .join("\n");

  const objectSchema = allowAdditionalProperties
    ? "z.object"
    : "z.strictObject";
  const additionalProperties = allowAdditionalProperties
    ? ".catchall(z.unknown())"
    : "";

  const closingIndentation = propertyIndentation.slice(0, -2);

  return `${objectSchema}({${properties ? `\n${properties}\n${closingIndentation}` : ""}})${additionalProperties}`;
}

function commentLines(value: string, indentation = "  "): string {
  return value
    .replaceAll("*/", "*\\/")
    .split(/\r?\n/)
    .map((line) => `${indentation} * ${line}`)
    .join("\n");
}

function deprecationMessage(
  event:
    | Readonly<{ status: "active" }>
    | Readonly<{
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
  views: readonly ViewDefinition[] = [],
  userTraits?: UserTraitsDefinition,
): string {
  const eventNames = renderEventNameConstants(events);
  const schemas = events
    .map((event) => {
      const deprecation = deprecationMessage(event);

      return `  /**
${commentLines(event.description)}
${deprecation ? `   * @deprecated ${deprecation}\n` : ""}   */
  ${JSON.stringify(event.name)}: ${propertiesToZod(event.properties, event.allowAdditionalProperties)},`;
    })
    .join("\n");

  const definitions = events
    .map((event) => {
      const deprecation = deprecationMessage(event);

      return `${
        deprecation ? `  /** @deprecated ${deprecation} */\n` : ""
      }  ${JSON.stringify(event.name)}: {
    description: ${JSON.stringify(event.description)},
${event.domain ? `    domain: ${JSON.stringify(event.domain)},\n` : ""}    key: ${JSON.stringify(event.key)},
${event.propertySets.length > 0 ? `    propertySets: ${JSON.stringify(event.propertySets)},\n` : ""}    status: ${JSON.stringify(event.status)},${
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

  const viewNameEntries = views
    .map(
      (view) => `  /**
${commentLines(view.description)}
   */
  ${view.key}: ${JSON.stringify(view.name)},`,
    )
    .join("\n");
  const viewSchemas = views
    .map(
      (view) => `  /**
${commentLines(view.description)}
   */
  ${JSON.stringify(view.name)}: ${propertiesToZod(view.properties, view.allowAdditionalProperties)},`,
    )
    .join("\n");
  const userTraitsSchema = propertiesToZod(
    userTraits?.traits ?? {},
    userTraits?.allowAdditionalTraits ?? false,
    "  ",
  );

  return `// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY. Edit src/definitions/**/*.json and run pnpm generate.

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

export const viewNames = {
${viewNameEntries}
} as const;

export const viewSchemas = {
${viewSchemas}
} as const;

export const userTraitsSchema = ${userTraitsSchema};

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

export type AnalyticsViewName = keyof typeof viewSchemas;

export type AnalyticsViews = {
  [Name in AnalyticsViewName]: z.infer<(typeof viewSchemas)[Name]>;
};

export type UserTraits = z.infer<typeof userTraitsSchema>;
`;
}

export function renderLanguageNeutralCatalog(
  events: readonly EventDefinition[],
  propertySets: readonly PropertySetDefinition[] = [],
  views: readonly ViewDefinition[] = [],
  userTraits?: UserTraitsDefinition,
): string {
  return `${JSON.stringify(
    {
      schemaVersion: LANGUAGE_NEUTRAL_CATALOG_SCHEMA_VERSION,
      propertySets,
      userTraits: userTraits ?? null,
      views,
      events,
    },
    null,
    2,
  )}\n`;
}
