import fs from "node:fs";
import path from "node:path";

import { Ajv, type AnySchema, type ErrorObject } from "ajv";

export type PropertyDefinition = Readonly<{
  type: "string" | "number" | "boolean";
  description?: string;
  optional: boolean;
  enum?: readonly string[];
  allowOtherValues: boolean;
}>;

export type EventDefinition = Readonly<{
  name: string;
  description: string;
  owner: string;
  allowAdditionalProperties: boolean;
  properties: Readonly<Record<string, PropertyDefinition>>;
}>;

type AuthoredPropertyDefinition = Omit<
  PropertyDefinition,
  "optional" | "allowOtherValues"
> & {
  optional?: boolean;
  allowOtherValues?: boolean;
};

type AuthoredEventDefinition = Omit<
  EventDefinition,
  "allowAdditionalProperties" | "properties"
> & {
  allowAdditionalProperties?: boolean;
  properties: Record<string, AuthoredPropertyDefinition>;
};

type EventDefinitionFile =
  | AuthoredEventDefinition
  | AuthoredEventDefinition[];

type LocatedEventDefinition = {
  definition: EventDefinition;
  source: string;
};

export type EventCatalog = Readonly<{
  events: readonly EventDefinition[];
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

function formatSchemaError(error: ErrorObject): string {
  const location = error.instancePath || "/";
  const details = error.params
    ? ` (${Object.entries(error.params)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(", ")})`
    : "";

  return `${location} ${error.message ?? "is invalid"}${details}`;
}

function normalizeEventDefinition(
  event: AuthoredEventDefinition,
): EventDefinition {
  return {
    name: event.name,
    description: event.description,
    owner: event.owner,
    allowAdditionalProperties: event.allowAdditionalProperties ?? false,
    properties: Object.fromEntries(
      Object.entries(event.properties).map(([name, property]) => [
        name,
        {
          type: property.type,
          ...(property.description === undefined
            ? {}
            : { description: property.description }),
          optional: property.optional ?? false,
          ...(property.enum === undefined ? {} : { enum: property.enum }),
          allowOtherValues: property.allowOtherValues ?? false,
        },
      ]),
    ),
  };
}

export function loadEventCatalog(rootDirectory: string): EventCatalog {
  const eventsDirectory = path.join(rootDirectory, "events");
  const schemaPath = path.join(rootDirectory, "event-definition.schema.json");
  const issues: string[] = [];

  if (!fs.existsSync(eventsDirectory)) {
    throw new CatalogValidationError(["events/: directory does not exist"]);
  }

  if (!fs.existsSync(schemaPath)) {
    throw new CatalogValidationError([
      "event-definition.schema.json: schema does not exist",
    ]);
  }

  let schema: unknown;

  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  } catch (error) {
    throw new CatalogValidationError([
      `event-definition.schema.json: ${error instanceof Error ? error.message : "invalid JSON"}`,
    ]);
  }

  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile<EventDefinitionFile>(schema as AnySchema);
  const files = findJsonFiles(eventsDirectory);

  if (files.length === 0) {
    issues.push("events/: no event definition JSON files were found");
  }

  const locatedEvents: LocatedEventDefinition[] = [];

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

    if (!validate(value)) {
      for (const error of validate.errors ?? []) {
        issues.push(`${source}: ${formatSchemaError(error)}`);
      }
      continue;
    }

    const definitions = Array.isArray(value) ? value : [value];

    for (const definition of definitions) {
      locatedEvents.push({
        definition: normalizeEventDefinition(definition),
        source,
      });
    }
  }

  const sourcesByName = new Map<string, string[]>();

  for (const event of locatedEvents) {
    const sources = sourcesByName.get(event.definition.name) ?? [];
    sources.push(event.source);
    sourcesByName.set(event.definition.name, sources);
  }

  for (const [name, sources] of sourcesByName) {
    if (sources.length > 1) {
      const sourceCounts = new Map<string, number>();

      for (const source of sources) {
        sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      }

      const locations = [...sourceCounts]
        .map(([source, count]) =>
          count === 1 ? source : `${source} (${count} occurrences)`,
        )
        .join(", ");

      issues.push(
        `duplicate event name ${JSON.stringify(name)} in ${locations}`,
      );
    }
  }

  if (issues.length > 0) {
    throw new CatalogValidationError(issues);
  }

  const events = locatedEvents
    .map(({ definition }) => definition)
    .sort((left, right) => left.name.localeCompare(right.name));
  const sources = [...new Set(locatedEvents.map(({ source }) => source))];

  return { events, sources };
}
