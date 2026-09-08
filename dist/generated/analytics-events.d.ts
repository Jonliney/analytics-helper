import { z } from "zod";
/**
 * User completes account registration
 * Owner: product
 */
export declare const SignupCompletedSchema: z.ZodObject<{
    method: z.ZodOptional<z.ZodEnum<{
        apple: "apple";
        email: "email";
        google: "google";
    }>>;
    campaign_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SignupCompleted = z.infer<typeof SignupCompletedSchema>;
export declare const eventSchemas: {
    readonly signup_completed: z.ZodObject<{
        method: z.ZodOptional<z.ZodEnum<{
            apple: "apple";
            email: "email";
            google: "google";
        }>>;
        campaign_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
};
export type AnalyticsEventName = keyof typeof eventSchemas;
export type AnalyticsEvents = {
    "signup_completed": SignupCompleted;
};
//# sourceMappingURL=analytics-events.d.ts.map