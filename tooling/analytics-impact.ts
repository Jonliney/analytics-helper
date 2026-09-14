import type { PropertyDefinition } from "./event-catalog.js";
import {
  comparePropertyDefinitions,
  comparePropertySetImpact,
  type ImpactCatalog,
  type ImpactClassification,
  type ImpactEvent,
  type PropertyImpact,
  type PropertySetImpact,
  type RecommendedVersionBump,
} from "./property-set-impact.js";

export type EventFieldImpact = Readonly<{
  field:
    | "name"
    | "domain"
    | "key"
    | "propertySets"
    | "description"
    | "purpose"
    | "allowAdditionalProperties"
    | "status"
    | "deprecatedSince"
    | "replacement";
  classification: ImpactClassification;
  summary: string;
}>;

export type EventPropertyImpact = PropertyImpact &
  Readonly<{
    inheritedFrom?: string;
  }>;

export type EventImpact = Readonly<{
  change: "added" | "removed" | "changed";
  classification: ImpactClassification;
  before?: ImpactEvent;
  after?: ImpactEvent;
  fields: readonly EventFieldImpact[];
  properties: readonly EventPropertyImpact[];
}>;

export type AnalyticsImpactSummary = Readonly<{
  eventsAdded: number;
  eventsRemoved: number;
  eventsChanged: number;
  eventsDeprecated: number;
  propertySetsChanged: number;
  affectedEvents: number;
}>;

export type AnalyticsImpactReport = Readonly<{
  base: string;
  recommendedVersionBump: RecommendedVersionBump;
  summary: AnalyticsImpactSummary;
  events: readonly EventImpact[];
  propertySets: readonly PropertySetImpact[];
}>;

type EventPair = Readonly<{
  before?: ImpactEvent;
  after?: ImpactEvent;
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

function versionBump(
  events: readonly EventImpact[],
  propertySets: readonly PropertySetImpact[],
): RecommendedVersionBump {
  const classifications = [
    ...events.map((event) => event.classification),
    ...propertySets.map((propertySet) => propertySet.classification),
  ];

  if (classifications.includes("breaking")) {
    return "major";
  }
  if (classifications.includes("additive")) {
    return "minor";
  }
  return classifications.length > 0 ? "patch" : "none";
}

function pairMatchingEvents(
  previous: readonly ImpactEvent[],
  proposed: readonly ImpactEvent[],
): EventPair[] {
  const unmatchedPrevious = new Set(previous);
  const unmatchedProposed = new Set(proposed);
  const pairs: EventPair[] = [];

  function matchUniqueBy(identity: (event: ImpactEvent) => string | undefined) {
    const previousByIdentity = new Map<string, ImpactEvent[]>();
    const proposedByIdentity = new Map<string, ImpactEvent[]>();

    for (const event of unmatchedPrevious) {
      const value = identity(event);
      if (value !== undefined) {
        previousByIdentity.set(value, [
          ...(previousByIdentity.get(value) ?? []),
          event,
        ]);
      }
    }
    for (const event of unmatchedProposed) {
      const value = identity(event);
      if (value !== undefined) {
        proposedByIdentity.set(value, [
          ...(proposedByIdentity.get(value) ?? []),
          event,
        ]);
      }
    }

    for (const [identityValue, previousEvents] of previousByIdentity) {
      const proposedEvents = proposedByIdentity.get(identityValue);
      if (previousEvents.length !== 1 || proposedEvents?.length !== 1) {
        continue;
      }

      const before = previousEvents[0]!;
      const after = proposedEvents[0]!;
      pairs.push({ before, after });
      unmatchedPrevious.delete(before);
      unmatchedProposed.delete(after);
    }
  }

  matchUniqueBy((event) => event.name);
  matchUniqueBy((event) =>
    event.key === undefined ? undefined : `${event.domain ?? ""}\0${event.key}`,
  );
  matchUniqueBy((event) => event.key);

  pairs.push(...[...unmatchedPrevious].map((before) => ({ before })));
  pairs.push(...[...unmatchedProposed].map((after) => ({ after })));

  return pairs.sort((left, right) =>
    (left.after?.name ?? left.before!.name).localeCompare(
      right.after?.name ?? right.before!.name,
    ),
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function compareEventFields(
  before: ImpactEvent,
  after: ImpactEvent,
): EventFieldImpact[] {
  const impacts: EventFieldImpact[] = [];

  if (before.name !== after.name) {
    impacts.push({
      field: "name",
      classification: "breaking",
      summary: `Provider event name changed from ${JSON.stringify(before.name)} to ${JSON.stringify(after.name)}`,
    });
  }
  if (before.domain !== after.domain) {
    impacts.push({
      field: "domain",
      classification: "breaking",
      summary: `Generated domain changed from ${JSON.stringify(before.domain ?? "<root>")} to ${JSON.stringify(after.domain ?? "<root>")}`,
    });
  }
  if (before.key !== after.key) {
    impacts.push({
      field: "key",
      classification: before.key === undefined ? "metadata" : "breaking",
      summary: `Generated key changed from ${JSON.stringify(before.key ?? "<not recorded>")} to ${JSON.stringify(after.key ?? "<not recorded>")}`,
    });
  }
  if (!sameStrings(before.propertySets, after.propertySets)) {
    impacts.push({
      field: "propertySets",
      classification: "metadata",
      summary: `Property-set references changed from ${JSON.stringify(before.propertySets)} to ${JSON.stringify(after.propertySets)}`,
    });
  }
  if (before.description !== after.description) {
    impacts.push({
      field: "description",
      classification: "metadata",
      summary: "Description changed",
    });
  }
  if (before.purpose !== after.purpose) {
    impacts.push({
      field: "purpose",
      classification: "metadata",
      summary: "Purpose changed",
    });
  }
  if (before.allowAdditionalProperties !== after.allowAdditionalProperties) {
    impacts.push({
      field: "allowAdditionalProperties",
      classification: after.allowAdditionalProperties ? "additive" : "breaking",
      summary: after.allowAdditionalProperties
        ? "Undeclared properties are now accepted"
        : "Undeclared properties are no longer accepted",
    });
  }
  if (before.status !== after.status) {
    impacts.push({
      field: "status",
      classification: "additive",
      summary: `Status changed from ${before.status} to ${after.status}`,
    });
  }
  if (before.deprecatedSince !== after.deprecatedSince) {
    impacts.push({
      field: "deprecatedSince",
      classification: "metadata",
      summary: `Deprecation date changed from ${JSON.stringify(before.deprecatedSince ?? "<none>")} to ${JSON.stringify(after.deprecatedSince ?? "<none>")}`,
    });
  }
  if (before.replacement !== after.replacement) {
    impacts.push({
      field: "replacement",
      classification: "metadata",
      summary: `Replacement changed from ${JSON.stringify(before.replacement ?? "<none>")} to ${JSON.stringify(after.replacement ?? "<none>")}`,
    });
  }

  return impacts;
}

function propertyOrigin(
  event: ImpactEvent,
  catalog: ImpactCatalog,
  property: string,
): string | undefined {
  const propertySetsByName = new Map(
    catalog.propertySets.map((propertySet) => [propertySet.name, propertySet]),
  );

  return event.propertySets.find(
    (propertySetName) =>
      propertySetsByName.get(propertySetName)?.properties[property] !== undefined,
  );
}

function compareEventPair(
  pair: EventPair,
  previous: ImpactCatalog,
  proposed: ImpactCatalog,
): EventImpact | undefined {
  if (pair.before === undefined) {
    return {
      change: "added",
      classification: "additive",
      after: pair.after!,
      fields: [],
      properties: [],
    };
  }
  if (pair.after === undefined) {
    return {
      change: "removed",
      classification: "breaking",
      before: pair.before,
      fields: [],
      properties: [],
    };
  }

  const fields = compareEventFields(pair.before, pair.after);
  const properties = comparePropertyDefinitions(
    pair.before.properties as Readonly<Record<string, PropertyDefinition>>,
    pair.after.properties as Readonly<Record<string, PropertyDefinition>>,
  ).map((impact): EventPropertyImpact => {
    const inheritedFrom =
      propertyOrigin(pair.after!, proposed, impact.property) ??
      propertyOrigin(pair.before!, previous, impact.property);
    return {
      ...impact,
      ...(inheritedFrom === undefined ? {} : { inheritedFrom }),
    };
  });

  if (fields.length === 0 && properties.length === 0) {
    return undefined;
  }

  return {
    change: "changed",
    classification: highestClassification([
      ...fields.map((impact) => impact.classification),
      ...properties.map((impact) => impact.classification),
    ]),
    before: pair.before,
    after: pair.after,
    fields,
    properties,
  };
}

export function compareAnalyticsImpact(
  previous: ImpactCatalog,
  proposed: ImpactCatalog,
  base: string,
): AnalyticsImpactReport {
  const events = pairMatchingEvents(previous.events, proposed.events).flatMap(
    (pair): EventImpact[] => {
      const impact = compareEventPair(pair, previous, proposed);
      return impact ? [impact] : [];
    },
  );
  const propertySets = comparePropertySetImpact(
    previous,
    proposed,
    base,
  ).impacts;
  const affectedEventNames = new Set(
    events.map((event) => (event.after ?? event.before)!.name),
  );
  for (const propertySet of propertySets) {
    for (const event of propertySet.affectedEvents) {
      affectedEventNames.add(event.name);
    }
  }

  return {
    base,
    recommendedVersionBump: versionBump(events, propertySets),
    summary: {
      eventsAdded: events.filter((event) => event.change === "added").length,
      eventsRemoved: events.filter((event) => event.change === "removed").length,
      eventsChanged: events.filter((event) => event.change === "changed").length,
      eventsDeprecated: events.filter(
        (event) =>
          event.before?.status === "active" &&
          event.after?.status === "deprecated",
      ).length,
      propertySetsChanged: propertySets.length,
      affectedEvents: affectedEventNames.size,
    },
    events,
    propertySets,
  };
}

function eventIdentifier(event: ImpactEvent): string {
  const key = event.key ?? event.name;
  return event.domain ? `${event.domain}.${key}` : key;
}

function classificationLabel(classification: ImpactClassification): string {
  return `${classification[0]!.toUpperCase()}${classification.slice(1)}`;
}

function formatPropertyImpact(property: EventPropertyImpact | PropertyImpact): string {
  const definition = property.after ?? property.before;
  const type = definition ? ` (${definition.type})` : "";
  const origin =
    "inheritedFrom" in property && property.inheritedFrom
      ? `; inherited from \`${property.inheritedFrom}\``
      : "";

  if (property.change === "added") {
    return `Added ${property.after?.optional ? "optional" : "required"} property \`${property.property}\`${type}${origin}`;
  }
  if (property.change === "removed") {
    return `Removed property \`${property.property}\`${type}${origin}`;
  }
  return `Property \`${property.property}\`: ${property.summary.join("; ")}${origin}`;
}

function formatEventList(events: readonly EventImpact[], change: "added" | "removed") {
  const matching = events.filter((event) => event.change === change);
  if (matching.length === 0) {
    return "";
  }

  const heading = change === "added" ? "Added events" : "Removed events";
  const entries = matching
    .map((impact) => {
      const event = (impact.after ?? impact.before)!;
      return `- \`${eventIdentifier(event)}\` — ${event.name}`;
    })
    .join("\n");
  return `## ${heading}\n\n${entries}`;
}

function formatChangedEvents(events: readonly EventImpact[]): string {
  const changed = events.filter((event) => event.change === "changed");
  if (changed.length === 0) {
    return "";
  }

  const entries = changed.map((impact) => {
    const event = impact.after!;
    const changes = [
      ...impact.fields.map(
        (field) =>
          `- **${classificationLabel(field.classification)}:** ${field.summary}`,
      ),
      ...impact.properties.map(
        (property) =>
          `- **${classificationLabel(property.classification)}:** ${formatPropertyImpact(property)}`,
      ),
    ].join("\n");
    const renamed =
      impact.before?.name !== event.name
        ? ` (previously ${impact.before?.name})`
        : "";

    return `### \`${eventIdentifier(event)}\` — ${event.name}${renamed}\n\n${changes}`;
  });

  return `## Changed events\n\n${entries.join("\n\n")}`;
}

function formatPropertySets(propertySets: readonly PropertySetImpact[]): string {
  if (propertySets.length === 0) {
    return "";
  }

  const entries = propertySets.map((propertySet) => {
    const changes = [
      ...propertySet.fields.map(
        (field) =>
          `- **${classificationLabel(field.classification)}:** ${field.summary}`,
      ),
      ...propertySet.properties.map(
        (property) =>
          `- **${classificationLabel(property.classification)}:** ${formatPropertyImpact(property)}`,
      ),
    ].join("\n");
    const events =
      propertySet.affectedEvents.length === 0
        ? "- None"
        : propertySet.affectedEvents
            .map((event) => {
              const key = event.key ?? event.name;
              const identifier = event.domain ? `${event.domain}.${key}` : key;
              return `- \`${identifier}\` — ${event.name}`;
            })
            .join("\n");
    const domains =
      propertySet.affectedDomains.length === 0
        ? "None"
        : propertySet.affectedDomains.map((domain) => `\`${domain}\``).join(", ");

    return `### \`${propertySet.propertySet}\` — ${propertySet.change}

${changes || "- No field-level changes"}

Affected domains: ${domains}

Affected events (${propertySet.affectedEvents.length}):

${events}`;
  });

  return `## Property-set changes\n\n${entries.join("\n\n")}`;
}

export function formatAnalyticsImpactReport(
  report: AnalyticsImpactReport,
): string {
  const header = `# Analytics contract impact

Base: \`${report.base}\`  
Recommended version change: **${report.recommendedVersionBump}**`;

  if (report.events.length === 0 && report.propertySets.length === 0) {
    return `${header}\n\nNo analytics contract changes found.`;
  }

  const summary = `## Summary

- Events added: ${report.summary.eventsAdded}
- Events removed: ${report.summary.eventsRemoved}
- Events changed: ${report.summary.eventsChanged}
- Events deprecated: ${report.summary.eventsDeprecated}
- Property sets changed: ${report.summary.propertySetsChanged}
- Events affected: ${report.summary.affectedEvents}`;
  const sections = [
    header,
    summary,
    formatEventList(report.events, "added"),
    formatEventList(report.events, "removed"),
    formatChangedEvents(report.events),
    formatPropertySets(report.propertySets),
  ].filter(Boolean);

  return sections.join("\n\n");
}
