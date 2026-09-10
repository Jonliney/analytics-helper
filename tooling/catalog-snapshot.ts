import type {
  EventDefinition,
  PropertyDefinition,
} from "./event-catalog.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProperty(value: unknown, path: string): PropertyDefinition {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }

  if (
    value.type !== "string" &&
    value.type !== "number" &&
    value.type !== "boolean"
  ) {
    throw new Error(`${path}.type is invalid.`);
  }

  if (value.description !== undefined && typeof value.description !== "string") {
    throw new Error(`${path}.description must be a string.`);
  }

  if (value.optional !== undefined && typeof value.optional !== "boolean") {
    throw new Error(`${path}.optional must be a boolean.`);
  }

  if (
    value.allowOtherValues !== undefined &&
    typeof value.allowOtherValues !== "boolean"
  ) {
    throw new Error(`${path}.allowOtherValues must be a boolean.`);
  }

  if (
    value.enum !== undefined &&
    (!Array.isArray(value.enum) ||
      !value.enum.every((entry) => typeof entry === "string"))
  ) {
    throw new Error(`${path}.enum must contain only strings.`);
  }

  return {
    type: value.type,
    ...(value.description === undefined
      ? {}
      : { description: value.description }),
    optional: value.optional ?? false,
    ...(value.enum === undefined
      ? {}
      : { enum: [...(value.enum as string[])] }),
    allowOtherValues: value.allowOtherValues ?? false,
  };
}

function parseEvent(value: unknown, index: number): EventDefinition {
  const path = `events[${index}]`;

  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }

  if (
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.owner !== "string" ||
    !isRecord(value.properties)
  ) {
    throw new Error(`${path} is not a generated event definition.`);
  }

  if (
    value.allowAdditionalProperties !== undefined &&
    typeof value.allowAdditionalProperties !== "boolean"
  ) {
    throw new Error(`${path}.allowAdditionalProperties must be a boolean.`);
  }

  return {
    name: value.name,
    description: value.description,
    owner: value.owner,
    allowAdditionalProperties: value.allowAdditionalProperties ?? false,
    properties: Object.fromEntries(
      Object.entries(value.properties).map(([name, property]) => [
        name,
        parseProperty(property, `${path}.properties.${name}`),
      ]),
    ),
  };
}

/**
 * Parses both current catalogs and older schema-version-1 catalogs whose
 * default false values were omitted.
 */
export function parseCatalogSnapshot(
  contents: string,
  source = "analytics catalog",
): readonly EventDefinition[] {
  let value: unknown;

  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `${source} is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
    );
  }

  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.events)
  ) {
    throw new Error(`${source} is not a supported analytics catalog.`);
  }

  const events = value.events.map(parseEvent);
  const names = new Set<string>();

  for (const event of events) {
    if (names.has(event.name)) {
      throw new Error(
        `${source} contains duplicate event ${JSON.stringify(event.name)}.`,
      );
    }
    names.add(event.name);
  }

  return events;
}
