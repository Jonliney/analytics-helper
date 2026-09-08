import fs from "node:fs";
import path from "node:path";

import { Ajv, type AnySchema, type ErrorObject } from "ajv";

export type PropertyDefinition = {
  type: "string" | "number" | "boolean";
  description?: string;
  optional?: boolean;
  enum?: string[];
};

export type EventDefinition = {
  name: string;
  description: string;
  owner: string;
  properties: Record<string, PropertyDefinition>;
};

type EventDefinitionFile = EventDefinition | EventDefinition[];

export type LoadedEventDefinition = {
  definition: EventDefinition;
  source: string;
};

export type EventCatalog = {
  events: LoadedEventDefinition[];
};

export class CatalogValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Analytics validation failed:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
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

  const events: LoadedEventDefinition[] = [];

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
      events.push({ definition, source });
    }
  }

  const sourcesByName = new Map<string, string[]>();

  for (const event of events) {
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

  events.sort((left, right) =>
    left.definition.name.localeCompare(right.definition.name),
  );

  return { events };
}
