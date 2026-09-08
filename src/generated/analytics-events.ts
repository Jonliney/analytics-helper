// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY.

import { z } from "zod"

/**
 * User completes account registration
 * Owner: product
 */
export const SignupCompletedSchema = z.object({
  "method": z.enum(["email", "google", "apple"]).optional(),
  "campaign_id": z.string().optional(),
})

export type SignupCompleted = z.infer<typeof SignupCompletedSchema>

export const eventSchemas = {
  "signup_completed": SignupCompletedSchema,
} as const

export type AnalyticsEventName = keyof typeof eventSchemas

export type AnalyticsEvents = {
  "signup_completed": SignupCompleted
}
