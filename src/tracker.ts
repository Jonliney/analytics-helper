import {
  eventSchemas,
  type AnalyticsEventName,
  type AnalyticsEvents,
} from "./generated/analytics-events.js";

export type CaptureFunction<Result = unknown> = (
  event: string,
  properties: Record<string, unknown>,
) => Result;

type WithoutExtraProperties<Expected, Candidate> = Candidate &
  Record<Exclude<keyof Candidate, keyof Expected>, never>;

export function isAnalyticsEventName(
  event: string,
): event is AnalyticsEventName {
  return Object.hasOwn(eventSchemas, event);
}

export function parseEvent<Name extends AnalyticsEventName>(
  event: Name,
  properties: unknown,
): AnalyticsEvents[Name] {
  if (!isAnalyticsEventName(event)) {
    throw new Error(`Unknown analytics event: ${event}`);
  }

  return eventSchemas[event].parse(properties) as AnalyticsEvents[Name];
}

/**
 * Creates a provider-agnostic, type-safe tracker. The adapter is the only place
 * that needs to know about PostHog (or another analytics SDK).
 */
export function createTracker<Result>(capture: CaptureFunction<Result>) {
  return function track<
    Name extends AnalyticsEventName,
    Properties extends AnalyticsEvents[Name],
  >(
    event: Name,
    properties: WithoutExtraProperties<AnalyticsEvents[Name], Properties>,
  ): Result {
    const parsedProperties = parseEvent(event, properties);

    return capture(event, parsedProperties as Record<string, unknown>);
  };
}
