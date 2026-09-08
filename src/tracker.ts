import {
  eventSchemas,
  type AnalyticsEvents,
} from "./generated/analytics-events";

type CaptureFunction = (
  event: string,
  properties: Record<string, unknown>,
) => void;

export function createTracker(capture: CaptureFunction) {
  return function track<E extends keyof AnalyticsEvents>(
    event: E,
    properties: AnalyticsEvents[E],
  ) {
    // Runtime validation
    eventSchemas[event].parse(properties);

    capture(event, properties as Record<string, unknown>);
  };
}
