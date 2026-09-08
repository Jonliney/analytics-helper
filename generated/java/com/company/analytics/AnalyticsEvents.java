// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY. Edit events/**/*.json and run pnpm generate.
package com.company.analytics;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class AnalyticsEvents {
  private AnalyticsEvents() {}

  public sealed interface Event permits SignupCompleted, SignupStarted {
    String name();
    Map<String, Object> properties();
  }

  public enum SignupCompletedMethodValue {
    EMAIL("email"),
    GOOGLE("google"),
    APPLE("apple");

    private final String value;

    SignupCompletedMethodValue(String value) {
      this.value = value;
    }

    public String value() {
      return value;
    }
  }
  public record SignupCompleted(SignupCompletedMethodValue method, String campaignId) implements Event {
    public SignupCompleted {
      Objects.requireNonNull(method, "method");
    }

    public SignupCompleted(SignupCompletedMethodValue method) {
      this(method, null);
    }

    @Override
    public String name() {
      return "Signup Completed";
    }

    @Override
    public Map<String, Object> properties() {
      Map<String, Object> values = new LinkedHashMap<>();
      values.put("method", method.value());
      if (campaignId != null) values.put("campaign_id", campaignId);
      return Map.copyOf(values);
    }
  }

  public record SignupStarted(String method, Map<String, Object> additionalProperties) implements Event {
    private static final Set<String> DECLARED_PROPERTIES = Set.of("method");

    public static final Set<String> METHOD_RECOMMENDED_VALUES = Set.of("email", "google", "apple");

    public SignupStarted {
      Objects.requireNonNull(method, "method");
      additionalProperties = Map.copyOf(Objects.requireNonNull(additionalProperties, "additionalProperties"));
      for (String key : additionalProperties.keySet()) {
        if (DECLARED_PROPERTIES.contains(key)) {
          throw new IllegalArgumentException("Additional property duplicates declared property: " + key);
        }
      }
    }

    public SignupStarted(String method) {
      this(method, Map.of());
    }

    @Override
    public String name() {
      return "Signup Started";
    }

    @Override
    public Map<String, Object> properties() {
      Map<String, Object> values = new LinkedHashMap<>();
      values.put("method", method);
      values.putAll(additionalProperties);
      return Map.copyOf(values);
    }
  }
}
