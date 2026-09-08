// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY.
import { z } from "zod";
/**
 * User completes account registration
 * Owner: product
 */
export const SignupCompletedSchema = z.object({
    "method": z.enum(["email", "google", "apple"]).optional(),
    "campaign_id": z.string().optional(),
});
export const eventSchemas = {
    "signup_completed": SignupCompletedSchema,
};
