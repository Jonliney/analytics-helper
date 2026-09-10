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
  policyViolations: readonly CatalogPolicyViolation[];
}>;

export type CatalogPolicyViolation = Readonly<{
  path: string;
  message: string;
}>;

export type CatalogComparisonOptions = Readonly<{
  asOf?: string;
  deprecationGracePeriodDays?: number;
}>;

const DEFAULT_DEPRECATION_GRACE_PERIOD_DAYS = 90;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

const IMPACT_RANK: Readonly<Record<VersionBump, number>> = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
};

function propertyPath(eventName: string, propertyName: string): string {
  return `${eventName}.${propertyName}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && isoDate(new Date(timestamp)) === value;
}

function addDays(date: string, days: number): string {
  return isoDate(
    new Date(Date.parse(`${date}T00:00:00.000Z`) + days * MILLISECONDS_PER_DAY),
  );
}

function resolveComparisonOptions(
  options: CatalogComparisonOptions,
): Required<CatalogComparisonOptions> {
  const asOf = options.asOf ?? isoDate(new Date());
  const deprecationGracePeriodDays =
    options.deprecationGracePeriodDays ??
    DEFAULT_DEPRECATION_GRACE_PERIOD_DAYS;

  if (!isIsoDate(asOf)) {
    throw new Error(`Invalid comparison date: ${asOf}`);
  }

  if (
    !Number.isInteger(deprecationGracePeriodDays) ||
    deprecationGracePeriodDays < 0
  ) {
    throw new Error("deprecationGracePeriodDays must be a non-negative integer");
  }

  return { asOf, deprecationGracePeriodDays };
}

function removalPolicyViolation(
  event: EventDefinition,
  options: Required<CatalogComparisonOptions>,
): CatalogPolicyViolation | undefined {
  if (event.status !== "deprecated") {
    return {
      path: event.name,
      message: "Active events must be deprecated in a published catalog before removal.",
    };
  }

  const eligibleOn = addDays(
    event.deprecatedSince,
    options.deprecationGracePeriodDays,
  );

  if (options.asOf < eligibleOn) {
    return {
      path: event.name,
      message: `Event cannot be removed until ${eligibleOn} (${options.deprecationGracePeriodDays}-day deprecation period).`,
    };
  }

  return undefined;
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

  if (previous.status !== current.status) {
    changes.push({
      impact: "patch",
      path: current.name,
      message:
        current.status === "deprecated"
          ? `Event was deprecated on ${current.deprecatedSince}.${
              current.replacement
                ? ` Use ${current.replacement} instead.`
                : ""
            }`
          : "Event was reactivated.",
    });
  } else if (
    previous.status === "deprecated" &&
    current.status === "deprecated"
  ) {
    if (previous.deprecatedSince !== current.deprecatedSince) {
      changes.push({
        impact: "patch",
        path: current.name,
        message: `Deprecation date changed from ${previous.deprecatedSince} to ${current.deprecatedSince}.`,
      });
    }

    if (previous.replacement !== current.replacement) {
      changes.push({
        impact: "patch",
        path: current.name,
        message: "Replacement event changed.",
      });
    }
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
  options: CatalogComparisonOptions = {},
): CatalogComparison {
  const resolvedOptions = resolveComparisonOptions(options);
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
  const policyViolations: CatalogPolicyViolation[] = [];

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
      const violation = removalPolicyViolation(previousEvent, resolvedOptions);
      if (violation) {
        policyViolations.push(violation);
      }
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

  return { requiredBump, changes, policyViolations };
}

export function isVersionBumpSufficient(
  selected: Exclude<VersionBump, "none">,
  required: VersionBump,
): boolean {
  return IMPACT_RANK[selected] >= IMPACT_RANK[required];
}
