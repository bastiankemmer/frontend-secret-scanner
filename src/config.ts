import { readRules, secretRules, type SecretRule } from "./rules.ts";

export type DetectorWhen = "onLiveChange" | "onChange";
export type DetectorReport = "detail" | "boolean";

export type DetectorConfig = {
  strict: boolean;
  when: DetectorWhen;
  report: DetectorReport;
  /** The text of `error.message`. `{labels}` is replaced by the kinds of key found. */
  message: string;
  rules: readonly SecretRule[];
};

const defaultMessage = "Don't send secrets. This looks like: {labels}.";

const knownKeys = new Set(["strict", "when", "report", "message", "rules"]);

const pick = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T => {
  if (value === undefined) return fallback;
  const found = allowed.find((item) => item === value);
  if (found !== undefined) return found;
  throw new Error(`${name} must be ${allowed.join(" or ")}.`);
};

const readStrict = (value: unknown) => {
  if (value === undefined) return true;
  if (typeof value !== "boolean") throw new Error("strict must be a boolean.");
  return value;
};

const readMessage = (value: unknown) => {
  if (value === undefined) return defaultMessage;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("message must be a non-empty string.");
  }
  return value;
};

const sealRule = (rule: SecretRule): SecretRule =>
  Object.freeze({
    rule: rule.rule,
    label: rule.label,
    source: rule.source,
    ...(rule.keywords === undefined ? {} : { keywords: Object.freeze([...rule.keywords]) }),
    ...(rule.scope === undefined ? {} : { scope: rule.scope }),
  });

const sealRules = (rules: readonly SecretRule[]) => Object.freeze(rules.map(sealRule));

export const parseConfig = (input: unknown): Readonly<DetectorConfig> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Config must be an object.");
  }
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) throw new Error(`Unknown config key: ${key}.`);
  }
  return Object.freeze({
    strict: readStrict(raw.strict),
    when: pick<DetectorWhen>(raw.when, ["onLiveChange", "onChange"], "onChange", "when"),
    report: pick<DetectorReport>(raw.report, ["detail", "boolean"], "detail", "report"),
    message: readMessage(raw.message),
    rules: sealRules(raw.rules === undefined ? secretRules : readRules(raw.rules)),
  });
};
