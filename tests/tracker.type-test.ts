import { createTracker } from "../src/index.js";

const track = createTracker(() => undefined);

track("Signup Completed", { method: "google" });

// @ts-expect-error The event is not declared in the catalog.
track("missing_event", {});

// @ts-expect-error method is required.
track("Signup Completed", {});

// @ts-expect-error enum values are generated as string literals.
track("Signup Completed", { method: "password" });

const propertiesWithAnExtraKey = {
  method: "apple" as const,
  unexpected: true,
};

// @ts-expect-error Variables with undeclared keys are rejected too.
track("Signup Completed", propertiesWithAnExtraKey);
