import type {
  EventDefinition,
  PropertyDefinition,
} from "./event-catalog.js";

const JAVA_KEYWORDS = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "exports",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "module",
  "native",
  "new",
  "non-sealed",
  "open",
  "opens",
  "package",
  "permits",
  "private",
  "protected",
  "provides",
  "public",
  "record",
  "requires",
  "return",
  "sealed",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "to",
  "transient",
  "transitive",
  "try",
  "uses",
  "var",
  "void",
  "volatile",
  "while",
  "with",
  "yield",
]);

const RESERVED_EVENT_METHODS = new Set([
  "additionalProperties",
  "name",
  "properties",
]);
const RESERVED_EVENT_CLASS_NAMES = new Set(["AnalyticsEvents", "Event"]);

function words(value: string): string[] {
  return value.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

function toPascalCase(value: string): string {
  const identifier = words(value)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return /^\d/.test(identifier) ? `Event${identifier}` : identifier;
}

function toCamelCase(value: string): string {
  const pascalCase = toPascalCase(value);
  let identifier = pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);

  if (JAVA_KEYWORDS.has(identifier)) {
    identifier += "Value";
  }

  if (RESERVED_EVENT_METHODS.has(identifier)) {
    identifier += "Property";
  }

  return identifier;
}

function toEnumConstant(value: string, index: number): string {
  let identifier = words(value)
    .map((word) => word.toUpperCase())
    .join("_");

  if (!identifier || /^\d/.test(identifier)) {
    identifier = `VALUE_${identifier || index + 1}`;
  }

  return identifier;
}

function escapeJava(value: string): string {
  return JSON.stringify(value).replaceAll("\\/", "/");
}

function enumTypeName(eventName: string, propertyName: string): string {
  return `${toPascalCase(eventName)}${toPascalCase(propertyName)}Value`;
}

function javaType(
  eventName: string,
  propertyName: string,
  property: PropertyDefinition,
): string {
  if (property.enum && !property.allowOtherValues) {
    return enumTypeName(eventName, propertyName);
  }

  switch (property.type) {
    case "string":
      return "String";
    case "number":
      return property.optional ? "Double" : "double";
    case "boolean":
      return property.optional ? "Boolean" : "boolean";
  }
}

function renderEnum(
  eventName: string,
  propertyName: string,
  values: readonly string[],
): string {
  const usedNames = new Map<string, number>();
  const constants = values.map((value, index) => {
    const baseName = toEnumConstant(value, index);
    const occurrence = (usedNames.get(baseName) ?? 0) + 1;
    usedNames.set(baseName, occurrence);
    const name = occurrence === 1 ? baseName : `${baseName}_${occurrence}`;
    return `    ${name}(${escapeJava(value)})`;
  });

  return `  public enum ${enumTypeName(eventName, propertyName)} {
${constants.join(",\n")};

    private final String value;

    ${enumTypeName(eventName, propertyName)}(String value) {
      this.value = value;
    }

    public String value() {
      return value;
    }
  }
`;
}

function renderEvent(event: EventDefinition): string {
  const className = toPascalCase(event.name);
  const properties = Object.entries(event.properties);
  const components = properties.map(
    ([name, property]) =>
      `${javaType(event.name, name, property)} ${toCamelCase(name)}`,
  );

  if (event.allowAdditionalProperties) {
    components.push("Map<String, Object> additionalProperties");
  }

  const requiredReferenceProperties = properties.filter(
    ([, property]) => !property.optional && property.type === "string",
  );
  const constructorChecks = requiredReferenceProperties.map(
    ([name]) =>
      `      Objects.requireNonNull(${toCamelCase(name)}, ${escapeJava(name)});`,
  );

  if (event.allowAdditionalProperties) {
    constructorChecks.push(
      `      additionalProperties = Map.copyOf(Objects.requireNonNull(additionalProperties, "additionalProperties"));`,
      `      for (String key : additionalProperties.keySet()) {`,
      `        if (DECLARED_PROPERTIES.contains(key)) {`,
      `          throw new IllegalArgumentException("Additional property duplicates declared property: " + key);`,
      `        }`,
      `      }`,
    );
  }

  const requiredComponents = properties.filter(
    ([, property]) => !property.optional,
  );
  const convenienceArguments = properties.map(([name, property]) =>
    property.optional ? "null" : toCamelCase(name),
  );

  if (event.allowAdditionalProperties) {
    convenienceArguments.push("Map.of()");
  }

  const needsConvenienceConstructor =
    requiredComponents.length !== components.length;
  const convenienceConstructor = needsConvenienceConstructor
    ? `
    public ${className}(${requiredComponents
      .map(
        ([name, property]) =>
          `${javaType(event.name, name, property)} ${toCamelCase(name)}`,
      )
      .join(", ")}) {
      this(${convenienceArguments.join(", ")});
    }
`
    : "";

  const declaredPropertyNames = properties
    .map(([name]) => escapeJava(name))
    .join(", ");
  const declaredPropertySet = event.allowAdditionalProperties
    ? `    private static final Set<String> DECLARED_PROPERTIES = Set.of(${declaredPropertyNames});\n\n`
    : "";

  const recommendedValues = properties
    .filter(([, property]) => property.enum && property.allowOtherValues)
    .map(
      ([name, property]) =>
        `    public static final Set<String> ${name.toUpperCase()}_RECOMMENDED_VALUES = Set.of(${property.enum!.map(escapeJava).join(", ")});`,
    )
    .join("\n");

  const mapStatements = properties.map(([name, property]) => {
    const identifier = toCamelCase(name);
    const value = property.enum && !property.allowOtherValues
      ? `${identifier}.value()`
      : identifier;

    return property.optional
      ? `      if (${identifier} != null) values.put(${escapeJava(name)}, ${value});`
      : `      values.put(${escapeJava(name)}, ${value});`;
  });

  if (event.allowAdditionalProperties) {
    mapStatements.push("      values.putAll(additionalProperties);");
  }

  return `  public record ${className}(${components.join(", ")}) implements Event {
${declaredPropertySet}${recommendedValues ? `${recommendedValues}\n\n` : ""}    public ${className} {
${constructorChecks.join("\n")}
    }
${convenienceConstructor}
    @Override
    public String name() {
      return ${escapeJava(event.name)};
    }

    @Override
    public Map<String, Object> properties() {
      Map<String, Object> values = new LinkedHashMap<>();
${mapStatements.join("\n")}
      return Map.copyOf(values);
    }
  }
`;
}

function assertValidJavaIdentifiers(
  events: readonly EventDefinition[],
): void {
  const classNames = new Map<string, string>();

  for (const event of events) {
    const className = toPascalCase(event.name);
    const existing = classNames.get(className);

    if (RESERVED_EVENT_CLASS_NAMES.has(className)) {
      throw new Error(
        `Java class name ${className} generated by ${JSON.stringify(event.name)} is reserved`,
      );
    }

    if (existing) {
      throw new Error(
        `Java class name collision: ${JSON.stringify(existing)} and ${JSON.stringify(event.name)} both generate ${className}`,
      );
    }

    classNames.set(className, event.name);

    const propertyIdentifiers = new Map<string, string>();

    for (const propertyName of Object.keys(event.properties)) {
      const identifier = toCamelCase(propertyName);
      const existingProperty = propertyIdentifiers.get(identifier);

      if (existingProperty) {
        throw new Error(
          `Java property name collision in ${JSON.stringify(event.name)}: ${JSON.stringify(existingProperty)} and ${JSON.stringify(propertyName)} both generate ${identifier}`,
        );
      }

      propertyIdentifiers.set(identifier, propertyName);
    }
  }
}

export function renderJavaCatalog(
  events: readonly EventDefinition[],
  packageName = "com.company.analytics",
): string {
  assertValidJavaIdentifiers(events);

  const enums = events
    .flatMap((event) =>
      Object.entries(event.properties)
        .filter(([, property]) => property.enum && !property.allowOtherValues)
        .map(([name, property]) =>
          renderEnum(event.name, name, property.enum!),
        ),
    )
    .join("\n");
  const permittedEvents = events
    .map((event) => toPascalCase(event.name))
    .join(", ");

  return `// AUTO-GENERATED FILE.
// DO NOT EDIT MANUALLY. Edit events/**/*.json and run pnpm generate.
package ${packageName};

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class AnalyticsEvents {
  private AnalyticsEvents() {}

  public sealed interface Event permits ${permittedEvents} {
    String name();
    Map<String, Object> properties();
  }

${enums}${events.map(renderEvent).join("\n")}}
`;
}
