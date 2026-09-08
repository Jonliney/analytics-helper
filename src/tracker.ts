import {
  eventSchemas,
  type AnalyticsEventName,
  type AnalyticsEvents,
} from "./generated/analytics-events.js";

export type CaptureFunction<Result = unknown> = (
  event: string,
  properties: Record<string, unknown>,
) => Result;

export type AnalyticsValidationFailure = Readonly<{
  event: string;
  properties: unknown;
  error: Error;
}>;

export type TrackerOptions<InvalidResult = void> = Readonly<{
  onInvalid: (failure: AnalyticsValidationFailure) => InvalidResult;
}>;

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
export function createTracker<Result>(
  capture: CaptureFunction<Result>,
): <
  Name extends AnalyticsEventName,
  Properties extends AnalyticsEvents[Name],
>(
  event: Name,
  properties: WithoutExtraProperties<AnalyticsEvents[Name], Properties>,
) => Result;
export function createTracker<Result, InvalidResult>(
  capture: CaptureFunction<Result>,
  options: TrackerOptions<InvalidResult>,
): <
  Name extends AnalyticsEventName,
  Properties extends AnalyticsEvents[Name],
>(
  event: Name,
  properties: WithoutExtraProperties<AnalyticsEvents[Name], Properties>,
) => Result | InvalidResult;
export function createTracker<Result, InvalidResult>(
  capture: CaptureFunction<Result>,
  options?: TrackerOptions<InvalidResult>,
) {
  return function track<
    Name extends AnalyticsEventName,
    Properties extends AnalyticsEvents[Name],
  >(
    event: Name,
    properties: WithoutExtraProperties<AnalyticsEvents[Name], Properties>,
  ): Result | InvalidResult {
    let parsedProperties: AnalyticsEvents[Name];

    try {
      parsedProperties = parseEvent(event, properties);
    } catch (error) {
      if (!options) {
        throw error;
      }

      return options.onInvalid({
        event,
        properties,
        error:
          error instanceof Error
            ? error
            : new Error("Analytics event validation failed", { cause: error }),
      });
    }

    return capture(event, parsedProperties as Record<string, unknown>);
  };
}
