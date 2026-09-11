// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY. Edit events/**/*.json and run pnpm generate.

import { z } from "zod";

export const eventNames = {
  auth: {
    /**
     * User completes account registration
     */
    signupCompleted: "Signup Completed",
    /**
     * User begins account registration
     */
    signupStarted: "signup_started",
  },
} as const;

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
  "signup_started": z.object({
    "method": (z.string() as z.ZodType<"email" | "google" | "apple" | (string & {}), string>).describe("Authentication method selected for registration"),
  }).catchall(z.unknown()),
} as const;

export const eventDefinitions = {
  "Signup Completed": {
    description: "User completes account registration",
    owner: "product",
    domain: "auth",
    status: "active",
  },
  "signup_started": {
    description: "User begins account registration",
    owner: "product",
    domain: "auth",
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
