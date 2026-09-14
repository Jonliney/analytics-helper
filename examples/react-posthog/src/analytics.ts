import { createAnalytics } from "data-system";
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

function logFallback(operation: string, ...values: unknown[]) {
  console.info(`[analytics example] ${operation}`, ...values);
}

export const analytics = createAnalytics({
  track(event, properties) {
    if (!posthogKey) {
      return logFallback("track", event, properties);
    }
    posthog.capture(event, properties);
  },

  identify(userId, traits) {
    if (!posthogKey) {
      return logFallback("identify", userId, traits);
    }
    posthog.identify(userId, traits);
  },

  view(name, properties) {
    if (!posthogKey) {
      return logFallback("view", name, properties);
    }
    posthog.capture("$pageview", {
      ...properties,
      page_name: name,
      $current_url: window.location.href,
    });
  },

  clearIdentity() {
    if (!posthogKey) {
      return logFallback("clearIdentity");
    }
    posthog.reset();
  },
});
