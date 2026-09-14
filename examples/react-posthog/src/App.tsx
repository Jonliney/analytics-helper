import { useState } from "react";
import { eventNames } from "data-system";
import { isPostHogConfigured, track } from "./analytics";

export function App() {
  const [lastTrackedAt, setLastTrackedAt] = useState<string>();

  function trackSignupCompleted() {
    track(eventNames.auth.signupCompleted, {
      method: "email",
      campaign_id: "integration-example",
    });

    setLastTrackedAt(new Date().toLocaleTimeString());
  }

  return (
    <main>
      <section>
        <p className="eyebrow">Integration example</p>
        <h1>Type-safe analytics with PostHog</h1>
        <p>
          This button captures the generated <code>Signup Completed</code> event
          with properties checked by TypeScript and Zod.
        </p>

        <button type="button" onClick={trackSignupCompleted}>
          Track Signup Completed
        </button>

        <p className="status" role="status">
          {lastTrackedAt
            ? `Event tracked at ${lastTrackedAt}.`
            : isPostHogConfigured
              ? "PostHog is configured and ready."
              : "No PostHog key found; events will be logged to the console."}
        </p>
      </section>
    </main>
  );
}
