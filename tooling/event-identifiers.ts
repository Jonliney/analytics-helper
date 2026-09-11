export const GENERATED_IDENTIFIER_PATTERN = /^[a-z][A-Za-z0-9]*$/;

type EventIdentifierMetadata = Readonly<{
  name: string;
  domain?: string;
  key?: string;
  description: string;
}>;

type IdentifiableEvent = EventIdentifierMetadata &
  (
    | Readonly<{ status: "active" }>
    | Readonly<{
        status: "deprecated";
        deprecatedSince: string;
        replacement?: string;
      }>
  );

export type ResolvedEventIdentifier = Readonly<{
  event: IdentifiableEvent;
  key: string;
}>;

export type EventNameHierarchy = Readonly<{
  root: readonly ResolvedEventIdentifier[];
  domains: ReadonlyMap<string, readonly ResolvedEventIdentifier[]>;
}>;

function deriveEventKey(eventName: string): string | undefined {
  const words = eventName.match(/[A-Za-z0-9]+/g) ?? [];

  if (words.length === 0) {
    return undefined;
  }

  const identifier = words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");

  return /^\d/.test(identifier)
    ? `event${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}`
    : identifier;
}

function eventKey(event: IdentifiableEvent): string | undefined {
  return event.key ?? deriveEventKey(event.name);
}

/**
 * Resolves the public eventNames paths and rejects ambiguous generated APIs.
 * Event source folders are intentionally absent from this interface.
 */
export function resolveEventNameHierarchy(
  events: readonly IdentifiableEvent[],
): EventNameHierarchy {
  const issues: string[] = [];
  const root: ResolvedEventIdentifier[] = [];
  const domains = new Map<string, ResolvedEventIdentifier[]>();
  const namesByScopeAndKey = new Map<string, Map<string, string>>();

  for (const event of events) {
    if (
      event.domain !== undefined &&
      !GENERATED_IDENTIFIER_PATTERN.test(event.domain)
    ) {
      issues.push(
        `Event ${JSON.stringify(event.name)} has invalid domain ${JSON.stringify(event.domain)}; use a lower-camel identifier such as "auth" or "accountSettings"`,
      );
      continue;
    }

    if (
      event.key !== undefined &&
      !GENERATED_IDENTIFIER_PATTERN.test(event.key)
    ) {
      issues.push(
        `Event ${JSON.stringify(event.name)} has invalid key ${JSON.stringify(event.key)}; use a lower-camel identifier such as "signupCompleted"`,
      );
      continue;
    }

    const key = eventKey(event);

    if (!key) {
      issues.push(
        `Event ${JSON.stringify(event.name)} cannot generate an eventNames key; add an explicit lower-camel "key"`,
      );
      continue;
    }

    const scope = event.domain ?? "<root>";
    const namesByKey = namesByScopeAndKey.get(scope) ?? new Map<string, string>();
    const existingName = namesByKey.get(key);

    if (existingName && existingName !== event.name) {
      const location = event.domain
        ? `in domain ${JSON.stringify(event.domain)}`
        : "at the root";
      issues.push(
        `eventNames key collision ${location}: ${JSON.stringify(existingName)} and ${JSON.stringify(event.name)} both resolve to ${JSON.stringify(key)}; set an explicit "key" on one event`,
      );
      continue;
    }

    namesByKey.set(key, event.name);
    namesByScopeAndKey.set(scope, namesByKey);

    const resolved = { event, key };
    if (event.domain) {
      const domainEvents = domains.get(event.domain) ?? [];
      domainEvents.push(resolved);
      domains.set(event.domain, domainEvents);
    } else {
      root.push(resolved);
    }
  }

  for (const resolved of root) {
    if (domains.has(resolved.key)) {
      issues.push(
        `Root event ${JSON.stringify(resolved.event.name)} resolves to key ${JSON.stringify(resolved.key)}, which conflicts with domain ${JSON.stringify(resolved.key)}; set a different event "key" or rename the domain`,
      );
    }
  }

  if (issues.length > 0) {
    throw new Error(issues.join("\n"));
  }

  root.sort((left, right) => left.key.localeCompare(right.key));
  const sortedDomains = new Map(
    [...domains]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([domain, domainEvents]) => [
        domain,
        domainEvents.sort((left, right) => left.key.localeCompare(right.key)),
      ]),
  );

  return { root, domains: sortedDomains };
}
