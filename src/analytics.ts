import type { ContractProperties } from "./contract-properties.js";
import {
  userTraitsSchema,
  viewSchemas,
  type AnalyticsViewName,
  type AnalyticsViews,
  type UserTraits,
} from "./generated/analytics-events.js";
import {
  createTracker,
  type AnalyticsValidationFailure,
  type Tracker,
} from "./tracker.js";

export type IdentifyFunction<Result = unknown> = (
  userId: string,
  traits: Record<string, unknown>,
) => Result;

export type ViewFunction<Result = unknown> = (
  name: string,
  properties: Record<string, unknown>,
) => Result;

export type ClearIdentityFunction<Result = unknown> = () => Result;

export type TrackValidationFailure = AnalyticsValidationFailure &
  Readonly<{ operation: "track" }>;

export type IdentifyValidationFailure = Readonly<{
  operation: "identify";
  userId: string;
  traits: unknown;
  error: Error;
}>;

export type ViewValidationFailure = Readonly<{
  operation: "view";
  name: string;
  properties: unknown;
  error: Error;
}>;

export type AnalyticsClientValidationFailure =
  | TrackValidationFailure
  | IdentifyValidationFailure
  | ViewValidationFailure;

export type AnalyticsClientOptions<InvalidResult = void> = Readonly<{
  onInvalid: (failure: AnalyticsClientValidationFailure) => InvalidResult;
}>;

export type AnalyticsAdapter<
  TrackResult = unknown,
  IdentifyResult = unknown,
  ViewResult = unknown,
  ClearIdentityResult = unknown,
> = Readonly<{
  track: (
    event: string,
    properties: Record<string, unknown>,
  ) => TrackResult;
  identify: IdentifyFunction<IdentifyResult>;
  view: ViewFunction<ViewResult>;
  clearIdentity: ClearIdentityFunction<ClearIdentityResult>;
}>;

export type AnalyticsClient<
  TrackResult = unknown,
  IdentifyResult = unknown,
  ViewResult = unknown,
  ClearIdentityResult = unknown,
  InvalidResult = never,
> = Readonly<{
  track: Tracker<TrackResult | InvalidResult>;
  identify: <Traits extends UserTraits>(
    userId: string,
    traits: ContractProperties<UserTraits, Traits>,
  ) => IdentifyResult | InvalidResult;
  view: <
    Name extends AnalyticsViewName,
    Properties extends AnalyticsViews[Name],
  >(
    name: Name,
    properties: ContractProperties<AnalyticsViews[Name], Properties>,
  ) => ViewResult | InvalidResult;
  clearIdentity: () => ClearIdentityResult;
}>;

export function parseUserTraits(traits: unknown): UserTraits {
  return userTraitsSchema.parse(traits);
}

export function isAnalyticsViewName(
  name: string,
): name is AnalyticsViewName {
  return Object.hasOwn(viewSchemas, name);
}

export function parseView<Name extends AnalyticsViewName>(
  name: Name,
  properties: unknown,
): AnalyticsViews[Name] {
  if (!isAnalyticsViewName(name)) {
    throw new Error(`Unknown analytics view: ${name}`);
  }

  return viewSchemas[name].parse(properties) as AnalyticsViews[Name];
}

function asValidationError(error: unknown, message: string): Error {
  return error instanceof Error ? error : new Error(message, { cause: error });
}

export function createAnalytics<
  TrackResult,
  IdentifyResult,
  ViewResult,
  ClearIdentityResult,
>(
  adapter: AnalyticsAdapter<
    TrackResult,
    IdentifyResult,
    ViewResult,
    ClearIdentityResult
  >,
): AnalyticsClient<
  TrackResult,
  IdentifyResult,
  ViewResult,
  ClearIdentityResult
>;
export function createAnalytics<
  TrackResult,
  IdentifyResult,
  ViewResult,
  ClearIdentityResult,
  InvalidResult,
>(
  adapter: AnalyticsAdapter<
    TrackResult,
    IdentifyResult,
    ViewResult,
    ClearIdentityResult
  >,
  options: AnalyticsClientOptions<InvalidResult>,
): AnalyticsClient<
  TrackResult,
  IdentifyResult,
  ViewResult,
  ClearIdentityResult,
  InvalidResult
>;
export function createAnalytics<
  TrackResult,
  IdentifyResult,
  ViewResult,
  ClearIdentityResult,
  InvalidResult,
>(
  adapter: AnalyticsAdapter<
    TrackResult,
    IdentifyResult,
    ViewResult,
    ClearIdentityResult
  >,
  options?: AnalyticsClientOptions<InvalidResult>,
): AnalyticsClient<
  TrackResult,
  IdentifyResult,
  ViewResult,
  ClearIdentityResult,
  InvalidResult
> {
  function onInvalid(
    failure: AnalyticsClientValidationFailure,
  ): InvalidResult {
    if (!options) {
      throw failure.error;
    }

    return options.onInvalid(failure);
  }

  const track: Tracker<TrackResult | InvalidResult> = options
    ? createTracker(
        (event, properties) => adapter.track(event, properties),
        {
          onInvalid(failure) {
            return onInvalid({ operation: "track", ...failure });
          },
        },
      )
    : createTracker((event, properties) =>
        adapter.track(event, properties),
      );

  return {
    track,

    identify(userId, traits) {
      let parsedTraits: UserTraits;

      try {
        if (!userId.trim()) {
          throw new Error("Analytics user ID cannot be empty");
        }

        parsedTraits = parseUserTraits(traits);
      } catch (error) {
        return onInvalid({
          operation: "identify",
          userId,
          traits,
          error: asValidationError(
            error,
            "Analytics user-trait validation failed",
          ),
        });
      }

      return adapter.identify(
        userId,
        parsedTraits as Record<string, unknown>,
      );
    },

    view(name, properties) {
      let parsedProperties: AnalyticsViews[typeof name];

      try {
        parsedProperties = parseView(name, properties);
      } catch (error) {
        return onInvalid({
          operation: "view",
          name,
          properties,
          error: asValidationError(error, "Analytics view validation failed"),
        });
      }

      return adapter.view(name, parsedProperties as Record<string, unknown>);
    },

    clearIdentity: () => adapter.clearIdentity(),
  };
}
