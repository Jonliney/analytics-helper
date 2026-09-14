import type { ContractProperties } from "./contract-properties.js";
import {
  userTraitsSchema,
  viewSchemas,
  type AnalyticsViewName,
  type AnalyticsViews,
  type UserTraits,
} from "./generated/analytics-events.js";
import { createTracker, type Tracker } from "./tracker.js";

export type IdentifyFunction<Result = unknown> = (
  userId: string,
  traits: Record<string, unknown>,
) => Result;

export type ViewFunction<Result = unknown> = (
  name: string,
  properties: Record<string, unknown>,
) => Result;

export type ClearIdentityFunction<Result = unknown> = () => Result;

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
> = Readonly<{
  track: Tracker<TrackResult>;
  identify: <Traits extends UserTraits>(
    userId: string,
    traits: ContractProperties<UserTraits, Traits>,
  ) => IdentifyResult;
  view: <
    Name extends AnalyticsViewName,
    Properties extends AnalyticsViews[Name],
  >(
    name: Name,
    properties: ContractProperties<AnalyticsViews[Name], Properties>,
  ) => ViewResult;
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
> {
  return {
    track: createTracker((event, properties) =>
      adapter.track(event, properties),
    ),

    identify(userId, traits) {
      if (!userId.trim()) {
        throw new Error("Analytics user ID cannot be empty");
      }

      return adapter.identify(
        userId,
        parseUserTraits(traits) as Record<string, unknown>,
      );
    },

    view(name, properties) {
      return adapter.view(
        name,
        parseView(name, properties) as Record<string, unknown>,
      );
    },

    clearIdentity: () => adapter.clearIdentity(),
  };
}
