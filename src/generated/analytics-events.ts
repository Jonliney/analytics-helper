// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY. Edit events/**/*.json and run pnpm generate.

import { z } from "zod";

export const eventSchemas = {
  /**
   * User completes account registration
   * Owner: product
   */
  "Signup Completed": z.strictObject({
    "method": z.enum(["email", "google", "apple"]).describe("Authentication method used for registration"),
    "campaign_id": z.string().optional().describe("Acquisition campaign identifier, when available"),
  }),
  /**
   * User begins account registration
   * Owner: product
   */
  "Signup Started": z.object({
    "method": z.string().describe("Authentication method selected for registration"),
  }).catchall(z.unknown()),
} as const;

export const eventDefinitions = {
  "Signup Completed": {
    description: "User completes account registration",
    owner: "product",
    status: "active",
  },
  "Signup Started": {
    description: "User begins account registration",
    owner: "product",
    status: "active",
  },
} as const;

export type AnalyticsEventName = keyof typeof eventSchemas;

export type AnalyticsEvents = {
  [Name in AnalyticsEventName]: z.infer<(typeof eventSchemas)[Name]>;
};

export type AnalyticsEvent = {
  [Name in AnalyticsEventName]: {
    name: Name;
    properties: AnalyticsEvents[Name];
  };
}[AnalyticsEventName];
