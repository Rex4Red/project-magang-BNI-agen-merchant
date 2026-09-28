import taxonomy from "./business-taxonomy.json";

export type BusinessDecision = "potensial" | "non_potensial" | "unknown";

export interface BusinessTypeResult {
  decision: BusinessDecision;
  reason: string | null;
}

const normalize = (value: string): string =>
  value.toLowerCase().normalize("NFKD")
    .replace(/([0-9])([a-z])|([a-z])([0-9])/g, "$1$3 $2$4")
    .replace(/[^a-z0-9]+/g, " ").trim();

const excludedTypes = taxonomy.excluded.map((rule) => [new RegExp(rule.pattern), rule.reason] as const);
const includedTypes = taxonomy.included.map((rule) => [new RegExp(rule.pattern), rule.reason] as const);

function findRule(value: string, rules: typeof includedTypes): string | null {
  for (const [pattern, reason] of rules) {
    if (pattern.test(value)) return reason;
  }
  return null;
}

export function classifyBusinessType(name: string, category: string): BusinessTypeResult {
  const normalizedName = normalize(name);
  const normalizedCategory = normalize(category).replace(normalizedName, " ").trim();

  const categoryExcluded = findRule(normalizedCategory, excludedTypes);
  const categoryIncluded = findRule(normalizedCategory, includedTypes);
  if (categoryExcluded && categoryIncluded) return { decision: "unknown", reason: null };
  if (categoryExcluded) return { decision: "non_potensial", reason: categoryExcluded };
  if (categoryIncluded) return { decision: "potensial", reason: categoryIncluded };

  const nameExcluded = findRule(normalizedName, excludedTypes);
  const nameIncluded = findRule(normalizedName, includedTypes);
  if (nameExcluded && nameIncluded) return { decision: "unknown", reason: null };
  if (nameExcluded) return { decision: "non_potensial", reason: nameExcluded };
  if (nameIncluded) return { decision: "potensial", reason: nameIncluded };
  return { decision: "unknown", reason: null };
}

