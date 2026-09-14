import { createTracker } from "data-system";
import posthog from "posthog-js/dist/module.slim";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost =
  import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const isPostHogConfigured = Boolean(posthogKey);

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: false,
  });
}

export const track = createTracker((event, properties) => {
  if (!posthogKey) {
    console.info("[analytics example]", event, properties);
    return;
  }

  posthog.capture(event, properties);
});
