import type { PropertyDefinition } from "./event-catalog.js";
import {
  comparePropertyDefinitions,
  comparePropertySetImpact,
  type ImpactCatalog,
  type ImpactClassification,
  type ImpactEvent,
  type ImpactUserTraits,
  type ImpactView,
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

export type ViewFieldImpact = Readonly<{
  field: "name" | "key" | "description" | "allowAdditionalProperties";
  classification: ImpactClassification;
  summary: string;
}>;

export type ViewImpact = Readonly<{
  change: "added" | "removed" | "changed";
  classification: ImpactClassification;
  before?: ImpactView;
  after?: ImpactView;
  fields: readonly ViewFieldImpact[];
  properties: readonly PropertyImpact[];
}>;

export type UserTraitsFieldImpact = Readonly<{
  field: "description" | "allowAdditionalTraits";
  classification: ImpactClassification;
  summary: string;
}>;

export type UserTraitsImpact = Readonly<{
  change: "added" | "removed" | "changed";
  classification: ImpactClassification;
  before?: ImpactUserTraits;
  after?: ImpactUserTraits;
  fields: readonly UserTraitsFieldImpact[];
  properties: readonly PropertyImpact[];
}>;

export type AnalyticsImpactSummary = Readonly<{
  eventsAdded: number;
  eventsRemoved: number;
  eventsChanged: number;
  eventsDeprecated: number;
  viewsAdded: number;
  viewsRemoved: number;
  viewsChanged: number;
  userTraitsChanged: boolean;
  propertySetsChanged: number;
  affectedEvents: number;
}>;

export type AnalyticsImpactReport = Readonly<{
  base: string;
  recommendedVersionBump: RecommendedVersionBump;
  summary: AnalyticsImpactSummary;
  events: readonly EventImpact[];
  views: readonly ViewImpact[];
  userTraits: UserTraitsImpact | null;
  propertySets: readonly PropertySetImpact[];
}>;

type ContractPair<Contract> = Readonly<{
  before?: Contract;
  after?: Contract;
}>;

type EventPair = ContractPair<ImpactEvent>;
type ViewPair = ContractPair<ImpactView>;

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
  views: readonly ViewImpact[],
  userTraits: UserTraitsImpact | undefined,
  propertySets: readonly PropertySetImpact[],
): RecommendedVersionBump {
  const classifications = [
    ...events.map((event) => event.classification),
    ...views.map((view) => view.classification),
    ...(userTraits ? [userTraits.classification] : []),
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

function pairMatchingContracts<Contract>(
  previous: readonly Contract[],
  proposed: readonly Contract[],
  identities: readonly ((contract: Contract) => string | undefined)[],
  sortName: (contract: Contract) => string,
): ContractPair<Contract>[] {
  const unmatchedPrevious = new Set(previous);
  const unmatchedProposed = new Set(proposed);
  const pairs: ContractPair<Contract>[] = [];

  function matchUniqueBy(identity: (contract: Contract) => string | undefined) {
    const previousByIdentity = new Map<string, Contract[]>();
    const proposedByIdentity = new Map<string, Contract[]>();

    for (const contract of unmatchedPrevious) {
      const value = identity(contract);
      if (value !== undefined) {
        previousByIdentity.set(value, [
          ...(previousByIdentity.get(value) ?? []),
          contract,
        ]);
      }
    }
    for (const contract of unmatchedProposed) {
      const value = identity(contract);
      if (value !== undefined) {
        proposedByIdentity.set(value, [
          ...(proposedByIdentity.get(value) ?? []),
          contract,
        ]);
      }
    }

    for (const [identityValue, previousContracts] of previousByIdentity) {
      const proposedContracts = proposedByIdentity.get(identityValue);
      if (
        previousContracts.length !== 1 ||
        proposedContracts?.length !== 1
      ) {
        continue;
      }

      const before = previousContracts[0]!;
      const after = proposedContracts[0]!;
      pairs.push({ before, after });
      unmatchedPrevious.delete(before);
      unmatchedProposed.delete(after);
    }
  }

  for (const identity of identities) {
    matchUniqueBy(identity);
  }

  pairs.push(...[...unmatchedPrevious].map((before) => ({ before })));
  pairs.push(...[...unmatchedProposed].map((after) => ({ after })));

  return pairs.sort((left, right) =>
    sortName(left.after ?? left.before!).localeCompare(
      sortName(right.after ?? right.before!),
    ),
  );
}

function pairMatchingEvents(
  previous: readonly ImpactEvent[],
  proposed: readonly ImpactEvent[],
): EventPair[] {
  return pairMatchingContracts(
    previous,
    proposed,
    [
      (event) => event.name,
      (event) =>
        event.key === undefined
          ? undefined
          : `${event.domain ?? ""}\0${event.key}`,
      (event) => event.key,
    ],
    (event) => event.name,
  );
}

function pairMatchingViews(
  previous: readonly ImpactView[],
  proposed: readonly ImpactView[],
): ViewPair[] {
  return pairMatchingContracts(
    previous,
    proposed,
    [(view) => view.name, (view) => view.key],
    (view) => view.name,
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

function compareViewFields(
  before: ImpactView,
  after: ImpactView,
): ViewFieldImpact[] {
  const impacts: ViewFieldImpact[] = [];

  if (before.name !== after.name) {
    impacts.push({
      field: "name",
      classification: "breaking",
      summary: `Provider view name changed from ${JSON.stringify(before.name)} to ${JSON.stringify(after.name)}`,
    });
  }
  if (before.key !== after.key) {
    impacts.push({
      field: "key",
      classification: before.key === undefined ? "metadata" : "breaking",
      summary: `Generated key changed from ${JSON.stringify(before.key ?? "<not recorded>")} to ${JSON.stringify(after.key ?? "<not recorded>")}`,
    });
  }
  if (before.description !== after.description) {
    impacts.push({
      field: "description",
      classification: "metadata",
      summary: "Description changed",
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

  return impacts;
}

function compareViewPair(pair: ViewPair): ViewImpact | undefined {
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

  const fields = compareViewFields(pair.before, pair.after);
  const properties = comparePropertyDefinitions(
    pair.before.properties as Readonly<Record<string, PropertyDefinition>>,
    pair.after.properties as Readonly<Record<string, PropertyDefinition>>,
  );

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

function compareUserTraits(
  before: ImpactUserTraits | null,
  after: ImpactUserTraits | null,
): UserTraitsImpact | undefined {
  if (before === null && after === null) {
    return undefined;
  }

  const effectiveBefore: ImpactUserTraits = before ?? {
    allowAdditionalTraits: false,
    traits: {},
  };
  const effectiveAfter: ImpactUserTraits = after ?? {
    allowAdditionalTraits: false,
    traits: {},
  };
  const fields: UserTraitsFieldImpact[] = [];

  if (effectiveBefore.description !== effectiveAfter.description) {
    fields.push({
      field: "description",
      classification: "metadata",
      summary: "Description changed",
    });
  }
  if (
    effectiveBefore.allowAdditionalTraits !==
    effectiveAfter.allowAdditionalTraits
  ) {
    fields.push({
      field: "allowAdditionalTraits",
      classification: effectiveAfter.allowAdditionalTraits
        ? "additive"
        : "breaking",
      summary: effectiveAfter.allowAdditionalTraits
        ? "Undeclared user traits are now accepted"
        : "Undeclared user traits are no longer accepted",
    });
  }

  const properties = comparePropertyDefinitions(
    effectiveBefore.traits as Readonly<Record<string, PropertyDefinition>>,
    effectiveAfter.traits as Readonly<Record<string, PropertyDefinition>>,
  );

  if (fields.length === 0 && properties.length === 0) {
    return undefined;
  }

  return {
    change: before === null ? "added" : after === null ? "removed" : "changed",
    classification: highestClassification([
      ...fields.map((impact) => impact.classification),
      ...properties.map((impact) => impact.classification),
    ]),
    ...(before === null ? {} : { before }),
    ...(after === null ? {} : { after }),
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
  const views = pairMatchingViews(previous.views, proposed.views).flatMap(
    (pair): ViewImpact[] => {
      const impact = compareViewPair(pair);
      return impact ? [impact] : [];
    },
  );
  const userTraits = compareUserTraits(
    previous.userTraits,
    proposed.userTraits,
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
    recommendedVersionBump: versionBump(
      events,
      views,
      userTraits,
      propertySets,
    ),
    summary: {
      eventsAdded: events.filter((event) => event.change === "added").length,
      eventsRemoved: events.filter((event) => event.change === "removed").length,
      eventsChanged: events.filter((event) => event.change === "changed").length,
      eventsDeprecated: events.filter(
        (event) =>
          event.before?.status === "active" &&
          event.after?.status === "deprecated",
      ).length,
      viewsAdded: views.filter((view) => view.change === "added").length,
      viewsRemoved: views.filter((view) => view.change === "removed").length,
      viewsChanged: views.filter((view) => view.change === "changed").length,
      userTraitsChanged: userTraits !== undefined,
      propertySetsChanged: propertySets.length,
      affectedEvents: affectedEventNames.size,
    },
    events,
    views,
    userTraits: userTraits ?? null,
    propertySets,
  };
}

function eventIdentifier(event: ImpactEvent): string {
  const key = event.key ?? event.name;
  return event.domain ? `${event.domain}.${key}` : key;
}

function viewIdentifier(view: ImpactView): string {
  return view.key ?? view.name;
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

function formatViewList(
  views: readonly ViewImpact[],
  change: "added" | "removed",
): string {
  const matching = views.filter((view) => view.change === change);
  if (matching.length === 0) {
    return "";
  }

  const heading = change === "added" ? "Added views" : "Removed views";
  const entries = matching
    .map((impact) => {
      const view = (impact.after ?? impact.before)!;
      return `- \`${viewIdentifier(view)}\` — ${view.name}`;
    })
    .join("\n");

  return `## ${heading}\n\n${entries}`;
}

function formatChangedViews(views: readonly ViewImpact[]): string {
  const changed = views.filter((view) => view.change === "changed");
  if (changed.length === 0) {
    return "";
  }

  const entries = changed.map((impact) => {
    const view = impact.after!;
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
      impact.before?.name !== view.name
        ? ` (previously ${impact.before?.name})`
        : "";

    return `### \`${viewIdentifier(view)}\` — ${view.name}${renamed}\n\n${changes}`;
  });

  return `## Changed views\n\n${entries.join("\n\n")}`;
}

function formatUserTraits(impact: UserTraitsImpact | null): string {
  if (impact === null) {
    return "";
  }

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

  return `## User-trait changes\n\nContract ${impact.change}.\n\n${changes}`;
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

  if (
    report.events.length === 0 &&
    report.views.length === 0 &&
    report.userTraits === null &&
    report.propertySets.length === 0
  ) {
    return `${header}\n\nNo analytics contract changes found.`;
  }

  const summary = `## Summary

- Events added: ${report.summary.eventsAdded}
- Events removed: ${report.summary.eventsRemoved}
- Events changed: ${report.summary.eventsChanged}
- Events deprecated: ${report.summary.eventsDeprecated}
- Views added: ${report.summary.viewsAdded}
- Views removed: ${report.summary.viewsRemoved}
- Views changed: ${report.summary.viewsChanged}
- User traits changed: ${report.summary.userTraitsChanged ? "yes" : "no"}
- Property sets changed: ${report.summary.propertySetsChanged}
- Events affected: ${report.summary.affectedEvents}`;
  const sections = [
    header,
    summary,
    formatEventList(report.events, "added"),
    formatEventList(report.events, "removed"),
    formatChangedEvents(report.events),
    formatViewList(report.views, "added"),
    formatViewList(report.views, "removed"),
    formatChangedViews(report.views),
    formatUserTraits(report.userTraits),
    formatPropertySets(report.propertySets),
  ].filter(Boolean);

  return sections.join("\n\n");
}
