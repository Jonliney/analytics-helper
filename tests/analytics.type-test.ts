import {
  createAnalytics,
  eventNames,
  viewNames,
} from "../src/index.js";

const analytics = createAnalytics({
  track() {
    return "tracked" as const;
  },
  identify() {
    return "identified" as const;
  },
  view() {
    return "viewed" as const;
  },
  clearIdentity() {
    return "cleared" as const;
  },
});

const trackResult: "tracked" = analytics.track(
  eventNames.auth.signupCompleted,
  { method: "email" },
);
const identifyResult: "identified" = analytics.identify("user-123", {
  email: "person@example.com",
  plan: "pro",
});
const viewResult: "viewed" = analytics.view(viewNames.integrationExample, {
  source: "documentation",
});
const clearResult: "cleared" = analytics.clearIdentity();
void trackResult;
void identifyResult;
void viewResult;
void clearResult;

const resilientAnalytics = createAnalytics(
  {
    track() {
      return "tracked" as const;
    },
    identify() {
      return "identified" as const;
    },
    view() {
      return "viewed" as const;
    },
    clearIdentity() {
      return "cleared" as const;
    },
  },
  {
    onInvalid(failure) {
      if (failure.operation === "track") {
        const event: string = failure.event;
        void event;
      } else if (failure.operation === "identify") {
        const userId: string = failure.userId;
        void userId;
      } else {
        const viewName: string = failure.name;
        void viewName;
      }

      return "dropped" as const;
    },
  },
);

const resilientTrackResult: "tracked" | "dropped" =
  resilientAnalytics.track(eventNames.auth.signupCompleted, {
    method: "email",
  });
const resilientIdentifyResult: "identified" | "dropped" =
  resilientAnalytics.identify("user-123", {});
const resilientViewResult: "viewed" | "dropped" = resilientAnalytics.view(
  viewNames.integrationExample,
  {},
);
const resilientClearResult: "cleared" = resilientAnalytics.clearIdentity();
void resilientTrackResult;
void resilientIdentifyResult;
void resilientViewResult;
void resilientClearResult;

analytics.identify("user-123", {});
analytics.view(viewNames.integrationExample, {});

// @ts-expect-error Only declared user traits are accepted.
analytics.identify("user-123", { temporary_trait: true });

const traitsWithAnExtraKey = { plan: "pro" as const, extra: true };
// @ts-expect-error Variables with undeclared user traits are rejected too.
analytics.identify("user-123", traitsWithAnExtraKey);

// @ts-expect-error Trait enum values are generated as string literals.
analytics.identify("user-123", { plan: "temporary" });

// @ts-expect-error Trait scalar types are enforced.
analytics.identify("user-123", { is_employee: "false" });

// @ts-expect-error Only declared views are accepted.
analytics.view("Missing View", {});

// @ts-expect-error View property types are enforced.
analytics.view(viewNames.integrationExample, { source: 42 });

// @ts-expect-error Strict views reject undeclared properties.
analytics.view(viewNames.integrationExample, { temporary_property: true });
