import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  parseAuthoredEventDefinitionFile,
  parseAuthoredPropertySetDefinitionFile,
  type EventDefinition,
  type PropertyDefinition,
  type PropertySetDefinition,
} from "./authoring-schema.js";
import { resolveEventNameHierarchy } from "./event-identifiers.js";

export type {
  EventDefinition,
  PropertyDefinition,
  PropertySetDefinition,
} from "./authoring-schema.js";

type LocatedDefinition<Definition> = Readonly<{
  definition: Definition;
  source: string;
}>;

export type EventCatalog = Readonly<{
  events: readonly EventDefinition[];
  propertySets: readonly PropertySetDefinition[];
  sources: readonly string[];
}>;

export class CatalogValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Analytics validation failed:\n${issues
        .map((issue) => `  - ${issue}`)
        .join("\n")}`,
    );
    this.name = "CatalogValidationError";
    this.issues = issues;
  }
}

function findJsonFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findJsonFiles(fullPath);
      }

      return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function formatSchemaIssue(issue: z.core.$ZodIssue): string {
  const location =
    issue.path.length === 0
      ? "/"
      : `/${issue.path
          .map((segment) =>
            String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
          )
          .join("/")}`;

  return `${location} ${issue.message}`;
}

function readDefinitionFiles<Definition>(
  rootDirectory: string,
  directoryName: string,
  required: boolean,
  parse: (value: unknown) => readonly Definition[],
  issues: string[],
): LocatedDefinition<Definition>[] {
  const directory = path.join(rootDirectory, directoryName);

  if (!fs.existsSync(directory)) {
    if (required) {
      issues.push(`${directoryName}/: directory does not exist`);
    }
    return [];
  }

  const files = findJsonFiles(directory);

  if (required && files.length === 0) {
    issues.push(`${directoryName}/: no definition JSON files were found`);
  }

  const locatedDefinitions: LocatedDefinition<Definition>[] = [];

  for (const file of files) {
    const source = path.relative(rootDirectory, file);
    const contents = fs.readFileSync(file, "utf8").trim();

    if (!contents) {
      issues.push(`${source}: file is empty`);
      continue;
    }

    let value: unknown;

    try {
      value = JSON.parse(contents);
    } catch (error) {
      issues.push(
        `${source}: invalid JSON (${error instanceof Error ? error.message : "parse failed"})`,
      );
      continue;
    }

    let definitions: readonly Definition[];

    try {
      definitions = parse(value);
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          issues.push(`${source}: ${formatSchemaIssue(issue)}`);
        }
      } else {
        issues.push(
          `${source}: ${error instanceof Error ? error.message : "validation failed"}`,
        );
      }
      continue;
    }

    for (const definition of definitions) {
      locatedDefinitions.push({ definition, source });
    }
  }

  return locatedDefinitions;
}

function reportDuplicateNames<Definition extends { name: string }>(
  definitions: readonly LocatedDefinition<Definition>[],
  label: string,
  issues: string[],
): void {
  const sourcesByName = new Map<string, string[]>();

  for (const { definition, source } of definitions) {
    const sources = sourcesByName.get(definition.name) ?? [];
    sources.push(source);
    sourcesByName.set(definition.name, sources);
  }

  for (const [name, sources] of sourcesByName) {
    if (sources.length < 2) {
      continue;
    }

    const sourceCounts = new Map<string, number>();
    for (const source of sources) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    }

    const locations = [...sourceCounts]
      .map(([source, count]) =>
        count === 1 ? source : `${source} (${count} occurrences)`,
      )
      .join(", ");

    issues.push(`duplicate ${label} name ${JSON.stringify(name)} in ${locations}`);
  }
}

function resolveSharedProperties(
  locatedEvents: readonly LocatedDefinition<EventDefinition>[],
  propertySetsByName: ReadonlyMap<string, PropertySetDefinition>,
  issues: string[],
): LocatedDefinition<EventDefinition>[] {
  return locatedEvents.map(({ definition: event, source }) => {
    const properties: Record<string, PropertyDefinition> = {};
    const propertyOrigins = new Map<string, string>();

    for (const propertySetName of event.propertySets) {
      const propertySet = propertySetsByName.get(propertySetName);

      if (!propertySet) {
        issues.push(
          `${source}: event ${JSON.stringify(event.name)} references unknown property set ${JSON.stringify(propertySetName)}`,
        );
        continue;
      }

      for (const [propertyName, property] of Object.entries(
        propertySet.properties,
      )) {
        const existingOrigin = propertyOrigins.get(propertyName);

        if (existingOrigin) {
          issues.push(
            `${source}: event ${JSON.stringify(event.name)} receives property ${JSON.stringify(propertyName)} from both property sets ${JSON.stringify(existingOrigin)} and ${JSON.stringify(propertySetName)}`,
          );
          continue;
        }

        properties[propertyName] = property;
        propertyOrigins.set(propertyName, propertySetName);
      }
    }

    for (const [propertyName, property] of Object.entries(event.properties)) {
      const propertySetName = propertyOrigins.get(propertyName);

      if (propertySetName) {
        issues.push(
          `${source}: event ${JSON.stringify(event.name)} declares property ${JSON.stringify(propertyName)}, but it is already provided by property set ${JSON.stringify(propertySetName)}`,
        );
        continue;
      }

      properties[propertyName] = property;
    }

    return {
      definition: { ...event, properties },
      source,
    };
  });
}

export function loadEventCatalog(rootDirectory: string): EventCatalog {
  const issues: string[] = [];
  const locatedPropertySets = readDefinitionFiles(
    rootDirectory,
    "property-sets",
    false,
    (value) => {
      const parsed = parseAuthoredPropertySetDefinitionFile(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    },
    issues,
  );
  const authoredEvents = readDefinitionFiles(
    rootDirectory,
    "events",
    true,
    (value) => {
      const parsed = parseAuthoredEventDefinitionFile(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    },
    issues,
  );

  reportDuplicateNames(locatedPropertySets, "property set", issues);
  reportDuplicateNames(authoredEvents, "event", issues);

  const propertySetsByName = new Map<string, PropertySetDefinition>();
  for (const { definition } of locatedPropertySets) {
    if (!propertySetsByName.has(definition.name)) {
      propertySetsByName.set(definition.name, definition);
    }
  }

  const locatedEvents = resolveSharedProperties(
    authoredEvents,
    propertySetsByName,
    issues,
  );
  const eventsByName = new Map(
    locatedEvents.map(({ definition }) => [definition.name, definition]),
  );

  for (const { definition, source } of locatedEvents) {
    if (definition.status !== "deprecated" || !definition.replacement) {
      continue;
    }

    const replacement = eventsByName.get(definition.replacement);

    if (definition.replacement === definition.name) {
      issues.push(`${source}: replacement cannot refer to the same event`);
    } else if (!replacement) {
      issues.push(
        `${source}: replacement event ${JSON.stringify(definition.replacement)} does not exist`,
      );
    } else if (replacement.status === "deprecated") {
      issues.push(
        `${source}: replacement event ${JSON.stringify(definition.replacement)} is deprecated`,
      );
    }
  }

  try {
    resolveEventNameHierarchy(
      locatedEvents.map(({ definition }) => definition),
    );
  } catch (error) {
    issues.push(
      ...(error instanceof Error
        ? error.message.split("\n")
        : ["generated event identifier validation failed"]),
    );
  }

  if (issues.length > 0) {
    throw new CatalogValidationError(issues);
  }

  const events = locatedEvents
    .map(({ definition }) => definition)
    .sort((left, right) => left.name.localeCompare(right.name));
  const propertySets = locatedPropertySets
    .map(({ definition }) => definition)
    .sort((left, right) => left.name.localeCompare(right.name));
  const sources = [
    ...new Set(
      [...locatedEvents, ...locatedPropertySets].map(({ source }) => source),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return { events, propertySets, sources };
}
