import type {
  EventDefinition,
  PropertyDefinition,
} from "./event-catalog.js";

export type VersionBump = "none" | "patch" | "minor" | "major";

export type CatalogChange = Readonly<{
  impact: Exclude<VersionBump, "none">;
  path: string;
  message: string;
}>;

export type CatalogComparison = Readonly<{
  requiredBump: VersionBump;
  changes: readonly CatalogChange[];
}>;

const IMPACT_RANK: Readonly<Record<VersionBump, number>> = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
};

function propertyPath(eventName: string, propertyName: string): string {
  return `${eventName}.${propertyName}`;
}

function sameValues(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const leftValues = new Set(left ?? []);
  const rightValues = new Set(right ?? []);

  return (
    leftValues.size === rightValues.size &&
    [...leftValues].every((value) => rightValues.has(value))
  );
}

function isClosedEnum(property: PropertyDefinition): boolean {
  return property.enum !== undefined && !property.allowOtherValues;
}

function compareStringValues(
  eventName: string,
  propertyName: string,
  previous: PropertyDefinition,
  current: PropertyDefinition,
): CatalogChange[] {
  const path = propertyPath(eventName, propertyName);
  const previousClosed = isClosedEnum(previous);
  const currentClosed = isClosedEnum(current);

  if (previousClosed && !currentClosed) {
    return [
      {
        impact: "minor",
        path,
        message: "Accepted string values were widened.",
      },
    ];
  }

  if (!previousClosed && currentClosed) {
    return [
      {
        impact: "major",
        path,
        message: "Accepted string values were restricted to an enum.",
      },
    ];
  }

  if (!previousClosed && !currentClosed) {
    return sameValues(previous.enum, current.enum)
      ? []
      : [
          {
            impact: "patch",
            path,
            message: "Recommended string values changed.",
          },
        ];
  }

  const previousValues = new Set(previous.enum);
  const currentValues = new Set(current.enum);
  const removedValues = [...previousValues].filter(
    (value) => !currentValues.has(value),
  );
  const addedValues = [...currentValues].filter(
    (value) => !previousValues.has(value),
  );
  const changes: CatalogChange[] = [];

  if (removedValues.length > 0) {
    changes.push({
      impact: "major",
      path,
      message: `Enum values removed: ${removedValues.join(", ")}.`,
    });
  }

  if (addedValues.length > 0) {
    changes.push({
      impact: "minor",
      path,
      message: `Enum values added: ${addedValues.join(", ")}.`,
    });
  }

  return changes;
}

function compareProperty(
  eventName: string,
  propertyName: string,
  previous: PropertyDefinition,
  current: PropertyDefinition,
): CatalogChange[] {
  const path = propertyPath(eventName, propertyName);
  const changes: CatalogChange[] = [];

  if (previous.type !== current.type) {
    changes.push({
      impact: "major",
      path,
      message: `Type changed from ${previous.type} to ${current.type}.`,
    });
  }

  if (previous.optional !== current.optional) {
    changes.push({
      impact: current.optional ? "minor" : "major",
      path,
      message: current.optional
        ? "Property became optional."
        : "Property became required.",
    });
  }

  if (previous.description !== current.description) {
    changes.push({
      impact: "patch",
      path,
      message: "Property description changed.",
    });
  }

  if (previous.type === "string" && current.type === "string") {
    changes.push(
      ...compareStringValues(
        eventName,
        propertyName,
        previous,
        current,
      ),
    );
  }

  return changes;
}

function compareEvent(
  previous: EventDefinition,
  current: EventDefinition,
): CatalogChange[] {
  const changes: CatalogChange[] = [];

  if (previous.description !== current.description) {
    changes.push({
      impact: "patch",
      path: current.name,
      message: "Event description changed.",
    });
  }

  if (previous.owner !== current.owner) {
    changes.push({
      impact: "patch",
      path: current.name,
      message: `Owner changed from ${previous.owner} to ${current.owner}.`,
    });
  }

  if (
    previous.allowAdditionalProperties !== current.allowAdditionalProperties
  ) {
    changes.push({
      impact: current.allowAdditionalProperties ? "minor" : "major",
      path: current.name,
      message: current.allowAdditionalProperties
        ? "Additional properties are now accepted."
        : "Additional properties are no longer accepted.",
    });
  }

  const propertyNames = new Set([
    ...Object.keys(previous.properties),
    ...Object.keys(current.properties),
  ]);

  for (const propertyName of [...propertyNames].sort()) {
    const previousProperty = previous.properties[propertyName];
    const currentProperty = current.properties[propertyName];
    const path = propertyPath(current.name, propertyName);

    if (!previousProperty && currentProperty) {
      changes.push({
        impact: currentProperty.optional ? "minor" : "major",
        path,
        message: currentProperty.optional
          ? "Optional property was added."
          : "Required property was added.",
      });
      continue;
    }

    if (previousProperty && !currentProperty) {
      changes.push({
        impact: "major",
        path,
        message: "Property was removed.",
      });
      continue;
    }

    if (previousProperty && currentProperty) {
      changes.push(
        ...compareProperty(
          current.name,
          propertyName,
          previousProperty,
          currentProperty,
        ),
      );
    }
  }

  return changes;
}

/** Compares validated, normalized event catalogs in deterministic name order. */
export function compareCatalogs(
  previousEvents: readonly EventDefinition[],
  currentEvents: readonly EventDefinition[],
): CatalogComparison {
  const previousByName = new Map(
    previousEvents.map((event) => [event.name, event]),
  );
  const currentByName = new Map(
    currentEvents.map((event) => [event.name, event]),
  );
  const eventNames = new Set([
    ...previousByName.keys(),
    ...currentByName.keys(),
  ]);
  const changes: CatalogChange[] = [];

  for (const eventName of [...eventNames].sort()) {
    const previousEvent = previousByName.get(eventName);
    const currentEvent = currentByName.get(eventName);

    if (!previousEvent && currentEvent) {
      changes.push({
        impact: "minor",
        path: eventName,
        message: "Event was added.",
      });
      continue;
    }

    if (previousEvent && !currentEvent) {
      changes.push({
        impact: "major",
        path: eventName,
        message: "Event was removed.",
      });
      continue;
    }

    if (previousEvent && currentEvent) {
      changes.push(...compareEvent(previousEvent, currentEvent));
    }
  }

  const requiredBump = changes.reduce<VersionBump>(
    (highest, change) =>
      IMPACT_RANK[change.impact] > IMPACT_RANK[highest]
        ? change.impact
        : highest,
    "none",
  );

  return { requiredBump, changes };
}

export function isVersionBumpSufficient(
  selected: Exclude<VersionBump, "none">,
  required: VersionBump,
): boolean {
  return IMPACT_RANK[selected] >= IMPACT_RANK[required];
}
