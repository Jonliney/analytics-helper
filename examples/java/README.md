# Java consumption example

The generator emits a Java 17 source contract at:

```text
generated/java/com/company/analytics/AnalyticsEvents.java
```

For a quick proof of concept, copy that package into a Java project's generated
sources. For production, publish the generated source as a small Maven package so
consumers can upgrade it like the TypeScript npm package.

Add PostHog's server SDK to the Java project:

```kotlin
dependencies {
    implementation("com.posthog:posthog-server:<version>")
}
```

Create a thin adapter from the generated event interface to PostHog:

```java
import com.company.analytics.AnalyticsEvents.Event;
import com.posthog.server.PostHogCaptureOptions;
import com.posthog.server.PostHogInterface;

public final class AnalyticsTracker {
  private final PostHogInterface posthog;

  public AnalyticsTracker(PostHogInterface posthog) {
    this.posthog = posthog;
  }

  public void track(String distinctId, Event event) {
    var options = PostHogCaptureOptions.builder();
    event.properties().forEach(options::property);
    posthog.capture(distinctId, event.name(), options.build());
  }
}
```

Call it with generated types:

```java
import com.company.analytics.AnalyticsEvents.SignupCompleted;
import com.company.analytics.AnalyticsEvents.SignupCompletedMethodValue;

tracker.track(
    userId,
    new SignupCompleted(SignupCompletedMethodValue.EMAIL)
);
```

An event that opts into additional properties exposes them deliberately:

```java
import com.company.analytics.AnalyticsEvents.SignupStarted;
import java.util.Map;

tracker.track(
    userId,
    new SignupStarted(
        "sso",
        Map.of("experiment_variant", "short-form")
    )
);
```

The manual publishing workflow attaches the catalog and generated Java source to
each GitHub release. A dedicated Maven publication can be added when Java adoption
justifies maintaining the group ID, artifact ID, and repository credentials.
