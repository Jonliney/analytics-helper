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
};
export const eventDefinitions = {
    "Signup Completed": {
        description: "User completes account registration",
        owner: "product",
    },
};
