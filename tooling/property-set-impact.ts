import { z } from "zod";

import type { EventCatalog, PropertyDefinition } from "./event-catalog.js";

const impactPropertySchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  description: z.string().optional(),
  optional: z.boolean().default(false),
  enum: z.array(z.string()).optional(),
  allowOtherValues: z.boolean().default(false),
});

const impactPropertySetSchema = z.object({
  name: z.string(),
  properties: z.record(z.string(), impactPropertySchema),
});

const impactEventSchema = z.object({
  name: z.string(),
  domain: z.string().optional(),
  key: z.string().optional(),
  propertySets: z.array(z.string()).default([]),
});

const impactCatalogSchema = z.object({
  schemaVersion: z.number(),
  propertySets: z.array(impactPropertySetSchema).default([]),
  events: z.array(impactEventSchema),
});

export type ImpactCatalog = z.output<typeof impactCatalogSchema>;
export type ImpactClassification = "breaking" | "additive" | "metadata";
export type RecommendedVersionBump = "major" | "minor" | "patch" | "none";

export type PropertyImpact = Readonly<{
  property: string;
  change: "added" | "removed" | "changed";
  classification: ImpactClassification;
  summary: readonly string[];
  before?: PropertyDefinition;
  after?: PropertyDefinition;
}>;

export type AffectedEvent = Readonly<{
  name: string;
  key?: string;
  domain?: string;
}>;

export type PropertySetImpact = Readonly<{
  propertySet: string;
  change: "added" | "removed" | "changed";
  classification: ImpactClassification;
  properties: readonly PropertyImpact[];
  affectedEvents: readonly AffectedEvent[];
  affectedDomains: readonly string[];
}>;

export type PropertySetImpactReport = Readonly<{
  base: string;
  recommendedVersionBump: RecommendedVersionBump;
  impacts: readonly PropertySetImpact[];
}>;

const CLASSIFICATION_RANK: Readonly<Record<ImpactClassification, number>> = {
  metadata: 0,
  additive: 1,
  breaking: 2,
};

function highestClassification(
  classifications: readonly ImpactClassification[],
): ImpactClassification {
  return classifications.reduce<ImpactClassification>(
    (highest, classification) =>
      CLASSIFICATION_RANK[classification] > CLASSIFICATION_RANK[highest]
        ? classification
        : highest,
    "metadata",
  );
}

function recommendedVersionBump(
  impacts: readonly PropertySetImpact[],
): RecommendedVersionBump {
  if (impacts.some((impact) => impact.classification === "breaking")) {
    return "major";
  }
  if (impacts.some((impact) => impact.classification === "additive")) {
    return "minor";
  }
  return impacts.length > 0 ? "patch" : "none";
}

function sameStrings(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function changedPropertyImpact(
  property: string,
  before: PropertyDefinition,
  after: PropertyDefinition,
): PropertyImpact | undefined {
  const summaries: string[] = [];
  const classifications: ImpactClassification[] = [];

  if (before.type !== after.type) {
    summaries.push(`type changed from ${before.type} to ${after.type}`);
    classifications.push("breaking");
  }

  if (before.optional !== after.optional) {
    summaries.push(after.optional ? "became optional" : "became required");
    classifications.push(after.optional ? "additive" : "breaking");
  }

  if (before.allowOtherValues !== after.allowOtherValues) {
    summaries.push(
      after.allowOtherValues
        ? "enum now accepts other values"
        : "enum no longer accepts other values",
    );
    classifications.push(after.allowOtherValues ? "additive" : "breaking");
  }

  if (!sameStrings(before.enum, after.enum)) {
    const beforeValues = new Set(before.enum ?? []);
    const afterValues = new Set(after.enum ?? []);
    const added = [...afterValues].filter((value) => !beforeValues.has(value));
    const removed = [...beforeValues].filter((value) => !afterValues.has(value));

    if (added.length > 0) {
      summaries.push(
        `enum added ${added.map((value) => JSON.stringify(value)).join(", ")}`,
      );
    }
    if (removed.length > 0) {
      summaries.push(
        `enum removed ${removed.map((value) => JSON.stringify(value)).join(", ")}`,
      );
    }

    if (before.enum === undefined && after.enum !== undefined) {
      classifications.push(after.allowOtherValues ? "metadata" : "breaking");
    } else if (before.enum !== undefined && after.enum === undefined) {
      classifications.push(before.allowOtherValues ? "metadata" : "additive");
    } else if (before.allowOtherValues || after.allowOtherValues) {
      classifications.push("metadata");
    } else {
      if (added.length > 0) {
        classifications.push("additive");
      }
      if (removed.length > 0) {
        classifications.push("breaking");
      }
    }
  }

  if (before.description !== after.description) {
    summaries.push("description changed");
    classifications.push("metadata");
  }

  if (summaries.length === 0) {
    return undefined;
  }

  return {
    property,
    change: "changed",
    classification: highestClassification(classifications),
    summary: summaries,
    before,
    after,
  };
}

function compareProperties(
  before: Readonly<Record<string, PropertyDefinition>>,
  after: Readonly<Record<string, PropertyDefinition>>,
): PropertyImpact[] {
  const propertyNames = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort((left, right) => left.localeCompare(right));

  return propertyNames.flatMap((property): PropertyImpact[] => {
    const previous = before[property];
    const proposed = after[property];

    if (!previous && proposed) {
      return [
        {
          property,
          change: "added",
          classification: proposed.optional ? "additive" : "breaking",
          summary: [proposed.optional ? "added as optional" : "added as required"],
          after: proposed,
        },
      ];
    }

    if (previous && !proposed) {
      return [
        {
          property,
          change: "removed",
          classification: "breaking",
          summary: ["removed"],
          before: previous,
        },
      ];
    }

    const changed = changedPropertyImpact(property, previous!, proposed!);
    return changed ? [changed] : [];
  });
}

function affectedEvents(
  propertySet: string,
  previous: ImpactCatalog,
  proposed: ImpactCatalog,
): AffectedEvent[] {
  const events = [...previous.events, ...proposed.events].filter((event) =>
    event.propertySets.includes(propertySet),
  );
  const eventsByName = new Map<string, AffectedEvent>();

  for (const event of events) {
    eventsByName.set(event.name, {
      name: event.name,
      ...(event.key === undefined ? {} : { key: event.key }),
      ...(event.domain === undefined ? {} : { domain: event.domain }),
    });
  }

  return [...eventsByName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function affectsExistingEvent(
  propertySet: string,
  previous: ImpactCatalog,
  proposed: ImpactCatalog,
): boolean {
  const proposedByName = new Map(
    proposed.events.map((event) => [event.name, event]),
  );

  return previous.events.some((event) => {
    const proposedEvent = proposedByName.get(event.name);
    return (
      proposedEvent !== undefined &&
      (event.propertySets.includes(propertySet) ||
        proposedEvent.propertySets.includes(propertySet))
    );
  });
}

export function parseImpactCatalog(value: unknown): ImpactCatalog {
  return impactCatalogSchema.parse(value);
}

export function impactCatalogFromEventCatalog(
  catalog: EventCatalog,
  schemaVersion: number,
): ImpactCatalog {
  return parseImpactCatalog({ schemaVersion, ...catalog });
}

export function comparePropertySetImpact(
  previous: ImpactCatalog,
  proposed: ImpactCatalog,
  base: string,
): PropertySetImpactReport {
  const previousByName = new Map(
    previous.propertySets.map((propertySet) => [propertySet.name, propertySet]),
  );
  const proposedByName = new Map(
    proposed.propertySets.map((propertySet) => [propertySet.name, propertySet]),
  );
  const propertySetNames = [
    ...new Set([...previousByName.keys(), ...proposedByName.keys()]),
  ].sort((left, right) => left.localeCompare(right));

  const impacts = propertySetNames.flatMap(
    (propertySetName): PropertySetImpact[] => {
      const before = previousByName.get(propertySetName);
      const after = proposedByName.get(propertySetName);
      const events = affectedEvents(propertySetName, previous, proposed);

      if (!before && after) {
        const changesExistingContract = affectsExistingEvent(
          propertySetName,
          previous,
          proposed,
        );
        const properties = compareProperties({}, after.properties).map((impact) =>
          changesExistingContract
            ? impact
            : { ...impact, classification: "additive" as const },
        );
        return [
          {
            propertySet: propertySetName,
            change: "added",
            classification:
              properties.length === 0
                ? "additive"
                : highestClassification(
                    properties.map((property) => property.classification),
                  ),
            properties,
            affectedEvents: events,
            affectedDomains: affectedDomains(events),
          },
        ];
      }

      if (before && !after) {
        return [
          {
            propertySet: propertySetName,
            change: "removed",
            classification: "breaking",
            properties: compareProperties(before.properties, {}),
            affectedEvents: events,
            affectedDomains: affectedDomains(events),
          },
        ];
      }

      const properties = compareProperties(before!.properties, after!.properties);
      if (properties.length === 0) {
        return [];
      }

      return [
        {
          propertySet: propertySetName,
          change: "changed",
          classification: highestClassification(
            properties.map((property) => property.classification),
          ),
          properties,
          affectedEvents: events,
          affectedDomains: affectedDomains(events),
        },
      ];
    },
  );

  return {
    base,
    recommendedVersionBump: recommendedVersionBump(impacts),
    impacts,
  };
}

function affectedDomains(events: readonly AffectedEvent[]): string[] {
  return [
    ...new Set(
      events.flatMap((event) =>
        event.domain === undefined ? [] : [event.domain],
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function formatEvent(event: AffectedEvent): string {
  const key = event.key ?? event.name;
  const identifier = event.domain ? `${event.domain}.${key}` : key;
  return `${identifier} (${event.name})`;
}

export function formatPropertySetImpactReport(
  report: PropertySetImpactReport,
): string {
  if (report.impacts.length === 0) {
    return `No property set changes found relative to ${report.base}.`;
  }

  const sections = report.impacts.map((impact) => {
    const properties = impact.properties
      .map(
        (property) =>
          `  ${property.change === "added" ? "+" : property.change === "removed" ? "-" : "~"} ${property.property}: ${property.summary.join("; ")} [${property.classification}]`,
      )
      .join("\n");
    const events =
      impact.affectedEvents.length === 0
        ? "  None"
        : impact.affectedEvents
            .map((event) => `  - ${formatEvent(event)}`)
            .join("\n");
    const domains =
      impact.affectedDomains.length === 0
        ? "None"
        : impact.affectedDomains.join(", ");

    return `Property set ${JSON.stringify(impact.propertySet)} ${impact.change} [${impact.classification}]

Properties:
${properties || "  None"}

Affected events (${impact.affectedEvents.length}):
${events}

Affected domains: ${domains}`;
  });

  return `Property set impact relative to ${report.base}
Recommended version change: ${report.recommendedVersionBump}

${sections.join("\n\n")}`;
}
