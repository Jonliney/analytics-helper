import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  parseAuthoredEventDefinitionFile,
  type EventDefinition,
} from "./authoring-schema.js";

export type {
  EventDefinition,
  PropertyDefinition,
} from "./authoring-schema.js";

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

export function loadEventCatalog(rootDirectory: string): EventCatalog {
  const eventsDirectory = path.join(rootDirectory, "events");
  const issues: string[] = [];

  if (!fs.existsSync(eventsDirectory)) {
    throw new CatalogValidationError(["events/: directory does not exist"]);
  }

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

    let definitions: readonly EventDefinition[];

    try {
      const parsed = parseAuthoredEventDefinitionFile(value);
      definitions = Array.isArray(parsed) ? parsed : [parsed];
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
      locatedEvents.push({
        definition,
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
