/**
 * Initialize a detector with what it should find.
 * A sentence is split into tokens. A token that matches a rule is a secret.
 * The host app chooses the input event, draws any warning, and decides
 * whether to send. Strict mode is the refusal flag.
 */

import { secretRules, type SecretRule } from "./rules.ts";
import { secretTokens, type SecretMatch } from "./scan.ts";

export type DetectorWhen = "onLiveChange" | "onChange";
export type DetectorReport = "detail" | "boolean";

export type DetectorConfig = {
  strict: boolean;
  when: DetectorWhen;
  report: DetectorReport;
  rules: readonly SecretRule[];
};

export const defaultConfig: DetectorConfig = {
  strict: true,
  when: "onChange",
  report: "detail",
  rules: secretRules,
};

export type CheckResult =
  | { pass: true; allowSend: true; report: DetectorReport }
  | { pass: false; allowSend: boolean; report: "boolean" }
  | {
      pass: false;
      allowSend: boolean;
      report: "detail";
      error: { message: string; matches: SecretMatch[] };
    };

export type Detector = {
  config: DetectorConfig;
  onLiveChange: (input: string) => CheckResult;
  onChange: (input: string) => CheckResult;
};

export const initializeSecretDetector = (input?: unknown): Detector => {
  const config = parseConfig(input);
  const check = (text: string): CheckResult => {
    const matches = secretTokens(text, config.rules);
    if (matches.length === 0) {
      return { pass: true, allowSend: true, report: config.report };
    }
    const allowSend = !config.strict;
    switch (config.report) {
      case "boolean":
        return { pass: false, allowSend, report: "boolean" };
      case "detail":
        return {
          pass: false,
          allowSend,
          report: "detail",
          error: {
            message: detailMessage(matches),
            matches,
          },
        };
      default: {
        const neverReport: never = config.report;
        throw new Error(neverReport);
      }
    }
  };

  return {
    config,
    onLiveChange: check,
    onChange: check,
  };
};

const detailMessage = (matches: readonly SecretMatch[]) => {
  const labels = [...new Set(matches.map((match) => match.label))];
  return `Don't send secrets. This looks like: ${labels.join(", ")}.`;
};

const parseConfig = (input: unknown): DetectorConfig => {
  if (input === undefined) {
    return freezeConfig({ ...defaultConfig, rules: [...secretRules] });
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Config must be an object.");
  }
  const raw = input as Record<string, unknown>;
  return freezeConfig({
    strict: readBoolean(raw.strict, defaultConfig.strict),
    when: readWhen(raw.when),
    report: readReport(raw.report),
    rules: raw.rules === undefined ? [...secretRules] : readRules(raw.rules),
  });
};

const freezeConfig = (config: DetectorConfig): DetectorConfig =>
  Object.freeze({ ...config, rules: Object.freeze([...config.rules]) });

const readBoolean = (value: unknown, fallback: boolean) => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error("strict must be a boolean.");
  return value;
};

const readWhen = (value: unknown): DetectorWhen => {
  if (value === undefined) return defaultConfig.when;
  if (value === "onLiveChange" || value === "onChange") return value;
  throw new Error("when must be onLiveChange or onChange.");
};

const readReport = (value: unknown): DetectorReport => {
  if (value === undefined) return defaultConfig.report;
  if (value === "detail" || value === "boolean") return value;
  throw new Error("report must be detail or boolean.");
};

const readRules = (value: unknown): SecretRule[] => {
  if (!Array.isArray(value)) throw new Error("rules must be a list.");
  return value.map((item) => {
    if (!isRule(item)) {
      throw new Error("Each rule needs a rule id, a label, and a source.");
    }
    try {
      RegExp(item.source, "g");
    } catch {
      throw new Error(`Invalid pattern for ${item.rule}.`);
    }
    return {
      rule: item.rule,
      label: item.label,
      source: item.source,
      ...(item.keywords === undefined ? {} : { keywords: [...item.keywords] }),
      ...(item.scope === undefined ? {} : { scope: item.scope }),
    };
  });
};

const isRule = (value: unknown): value is SecretRule => {
  if (typeof value !== "object" || value === null) return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.rule === "string" &&
    rule.rule.length > 0 &&
    typeof rule.label === "string" &&
    rule.label.length > 0 &&
    typeof rule.source === "string" &&
    rule.source.length > 0 &&
    (rule.scope === undefined || rule.scope === "token" || rule.scope === "text") &&
    (rule.keywords === undefined ||
      (Array.isArray(rule.keywords) &&
        rule.keywords.every(
          (keyword) => typeof keyword === "string" && keyword.trim().length > 0,
        )))
  );
};
