// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY. Edit src/definitions/**/*.json and run pnpm generate.

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
   */
  "Signup Completed": z.strictObject({
    "method": z.enum(["email", "google", "apple"]).describe("Authentication method used for registration"),
    "campaign_id": z.string().optional().describe("Acquisition campaign identifier, when available"),
  }),
  /**
   * User begins account registration
   */
  "signup_started": z.object({
    "method": (z.string() as z.ZodType<"email" | "google" | "apple" | (string & {}), string>).describe("Authentication method selected for registration"),
  }).catchall(z.unknown()),
} as const;

export const eventDefinitions = {
  "Signup Completed": {
    description: "User completes account registration",
    domain: "auth",
    key: "signupCompleted",
    status: "active",
  },
  "signup_started": {
    description: "User begins account registration",
    domain: "auth",
    key: "signupStarted",
    status: "active",
  },
} as const;

export const viewNames = {
  /**
   * User views the React integration example
   */
  integrationExample: "Integration Example",
} as const;

export const viewSchemas = {
  /**
   * User views the React integration example
   */
  "Integration Example": z.strictObject({
    "source": z.enum(["direct", "documentation"]).optional().describe("How the user reached the view"),
  }),
} as const;

export const userTraitsSchema = z.strictObject({
  "email": z.string().optional().describe("User email address"),
  "plan": z.enum(["free", "pro", "enterprise"]).optional().describe("Current product plan"),
  "is_employee": z.boolean().optional().describe("Whether the user is a company employee"),
});

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

export type AnalyticsViewName = keyof typeof viewSchemas;

export type AnalyticsViews = {
  [Name in AnalyticsViewName]: z.infer<(typeof viewSchemas)[Name]>;
};

export type UserTraits = z.infer<typeof userTraitsSchema>;
