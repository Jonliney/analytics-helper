export {
  createTracker,
  isAnalyticsEventName,
  parseEvent,
  type AnalyticsValidationFailure,
  type CaptureFunction,
  type TrackerOptions,
  type Tracker,
} from "./tracker.js";

export {
  createAnalytics,
  isAnalyticsViewName,
  parseUserTraits,
  parseView,
  type AnalyticsAdapter,
  type AnalyticsClient,
  type ClearIdentityFunction,
  type IdentifyFunction,
  type ViewFunction,
} from "./analytics.js";

export {
  eventDefinitions,
  eventNames,
  eventSchemas,
  userTraitsSchema,
  viewNames,
  viewSchemas,
} from "./generated/analytics-events.js";

export type {
  AnalyticsEvent,
  AnalyticsEvents,
  AnalyticsEventName,
  AnalyticsViewName,
  AnalyticsViews,
  UserTraits,
} from "./generated/analytics-events.js";
