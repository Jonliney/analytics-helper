import { z } from "zod";
export declare const eventSchemas: {
    /**
     * User completes account registration
     * Owner: product
     */
    readonly "Signup Completed": z.ZodObject<{
        method: z.ZodEnum<{
            apple: "apple";
            email: "email";
            google: "google";
        }>;
        campaign_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    /**
     * User begins account registration
     * Owner: product
     */
    readonly "Signup Started": z.ZodObject<{
        method: z.ZodString;
    }, z.core.$catchall<z.ZodUnknown>>;
};
export declare const eventDefinitions: {
    readonly "Signup Completed": {
        readonly description: "User completes account registration";
        readonly owner: "product";
        readonly status: "active";
    };
    readonly "Signup Started": {
        readonly description: "User begins account registration";
        readonly owner: "product";
        readonly status: "active";
    };
};
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
//# sourceMappingURL=analytics-events.d.ts.map