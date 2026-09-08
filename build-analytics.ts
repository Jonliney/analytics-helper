import fs from "node:fs";
import path from "node:path";

const EVENTS_DIR = path.join(process.cwd(), "events");
const OUTPUT_DIR = path.join(process.cwd(), "src/generated");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "analytics-events.ts");

type PropertyDefinition = {
  type: "string" | "number" | "boolean";
  enum?: string[];
};

type EventDefinition = {
  name: string;
  description: string;
  owner: string;
  properties: Record<string, PropertyDefinition>;
  required?: string[];
};

function findJsonFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return findJsonFiles(fullPath);
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      return [fullPath];
    }

    return [];
  });
}

function toPascalCase(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function propertyToZod(property: PropertyDefinition): string {
  if (property.enum?.length) {
    const values = property.enum
      .map((value) => JSON.stringify(value))
      .join(", ");

    return `z.enum([${values}])`;
  }

  switch (property.type) {
    case "string":
      return "z.string()";

    case "number":
      return "z.number()";

    case "boolean":
      return "z.boolean()";

    default:
      throw new Error(`Unsupported property type: ${property.type}`);
  }
}

function eventToZod(event: EventDefinition): string {
  const required = new Set(event.required ?? []);

  const properties = Object.entries(event.properties)
    .map(([name, definition]) => {
      let schema = propertyToZod(definition);

      if (!required.has(name)) {
        schema += ".optional()";
      }

      return `  ${JSON.stringify(name)}: ${schema},`;
    })
    .join("\n");

  return `z.object({\n${properties}\n})`;
}

const files = findJsonFiles(EVENTS_DIR);

const events: EventDefinition[] = files.map((file) => {
  const contents = fs.readFileSync(file, "utf8").trim();

  if (!contents) {
    throw new Error(`Event file is empty: ${file}`);
  }

  return JSON.parse(contents);
});

const duplicateNames = events
  .map((event) => event.name)
  .filter((name, index, all) => all.indexOf(name) !== index);

if (duplicateNames.length) {
  throw new Error(
    `Duplicate event names: ${[...new Set(duplicateNames)].join(", ")}`,
  );
}

events.sort((a, b) => a.name.localeCompare(b.name));

const schemas = events
  .map((event) => {
    const typeName = toPascalCase(event.name);

    return `
/**
 * ${event.description}
 * Owner: ${event.owner}
 */
export const ${typeName}Schema = ${eventToZod(event)}

export type ${typeName} = z.infer<typeof ${typeName}Schema>
`.trim();
  })
  .join("\n\n");

const registry = events
  .map((event) => {
    const typeName = toPascalCase(event.name);

    return `  ${JSON.stringify(event.name)}: ${typeName}Schema,`;
  })
  .join("\n");

const eventTypes = events
  .map((event) => {
    const typeName = toPascalCase(event.name);

    return `  ${JSON.stringify(event.name)}: ${typeName}`;
  })
  .join("\n");

const output = `
// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY.

import { z } from "zod"

${schemas}

export const eventSchemas = {
${registry}
} as const

export type AnalyticsEventName = keyof typeof eventSchemas

export type AnalyticsEvents = {
${eventTypes}
}
`.trimStart();

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, output);

console.log(
  `Generated ${events.length} analytics events → ${path.relative(
    process.cwd(),
    OUTPUT_FILE,
  )}`,
);
