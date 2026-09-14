import { useState } from "react";
import { eventNames, viewNames } from "data-system";
import { analytics, isPostHogConfigured } from "./analytics";

export function App() {
  const [status, setStatus] = useState<string>();

  function record(action: string) {
    setStatus(`${action} at ${new Date().toLocaleTimeString()}.`);
  }

  function trackSignupCompleted() {
    analytics.track(eventNames.auth.signupCompleted, {
      method: "email",
      campaign_id: "integration-example",
    });
    record("Tracked Signup Completed");
  }

  function identifyExampleUser() {
    analytics.identify("example-user-123", {
      email: "person@example.com",
      plan: "pro",
      is_employee: false,
    });
    record("Identified example user");
  }

  function trackExampleView() {
    analytics.view(viewNames.integrationExample, {
      source: "documentation",
    });
    record("Tracked Integration Example view");
  }

  function clearExampleIdentity() {
    analytics.clearIdentity();
    record("Cleared identity");
  }

  return (
    <main>
      <section>
        <p className="eyebrow">Integration example</p>
        <h1>Type-safe analytics with PostHog</h1>
        <p>
          Each operation is checked by generated TypeScript types and Zod
          schemas before the PostHog adapter receives it.
        </p>

        <div className="actions">
          <button type="button" onClick={trackSignupCompleted}>
            Track event
          </button>
          <button type="button" onClick={identifyExampleUser}>
            Identify user
          </button>
          <button type="button" onClick={trackExampleView}>
            Track view
          </button>
          <button type="button" onClick={clearExampleIdentity}>
            Clear identity
          </button>
        </div>

        <p className="status" role="status">
          {status
            ? status
            : isPostHogConfigured
              ? "PostHog is configured and ready."
              : "No PostHog key found; events will be logged to the console."}
        </p>
      </section>
    </main>
  );
}
