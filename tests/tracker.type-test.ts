import {
  createTracker,
  eventNames,
  type AnalyticsValidationFailure,
} from "../src/index.js";

const track = createTracker(() => undefined);

track(eventNames.auth.signupCompleted, { method: "google" });
track(eventNames.auth.signupStarted, {
  method: "sso",
  experiment_variant: "short-form",
});

const temporaryMethod: string = "temporary-provider";
track(eventNames.auth.signupStarted, { method: temporaryMethod });

// @ts-expect-error The event is not declared in the catalog.
track("missing_event", {});

// @ts-expect-error method is required.
track("Signup Completed", {});

// @ts-expect-error Open events still enforce declared required properties.
track("signup_started", { experiment_variant: "short-form" });

// @ts-expect-error enum values are generated as string literals.
track("Signup Completed", { method: "password" });

const propertiesWithAnExtraKey = {
  method: "apple" as const,
  unexpected: true,
};

// @ts-expect-error Variables with undeclared keys are rejected too.
track("Signup Completed", propertiesWithAnExtraKey);

const strictResultTracker = createTracker(() => "captured" as const);
const strictResult: "captured" = strictResultTracker(eventNames.auth.signupCompleted, {
  method: "email",
});
void strictResult;

const resilientTracker = createTracker(
  () => "captured" as const,
  {
    onInvalid(failure) {
      const typedFailure: AnalyticsValidationFailure = failure;
      const event: string = failure.event;
      const properties: unknown = failure.properties;
      const error: Error = failure.error;
      void typedFailure;
      void event;
      void properties;
      void error;
      return "dropped" as const;
    },
  },
);
const resilientResult: "captured" | "dropped" = resilientTracker(
  eventNames.auth.signupCompleted,
  { method: "google" },
);
void resilientResult;
