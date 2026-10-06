/**
 * Initialize a detector with what it should find.
 * A sentence is split into tokens. A token that matches a rule is a secret.
 * The host app draws any warning and decides whether to send. Strict mode is
 * the refusal flag. `attach` wires the check to a text field.
 */

import { attachToField, type SecretField } from "./attach.ts";
import {
  parseConfig,
  type DetectorConfig,
  type DetectorReport,
  type DetectorWhen,
} from "./config.ts";
import { findSecrets, type SecretMatch } from "./scan.ts";

export type { DetectorConfig, DetectorReport, DetectorWhen };

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
  config: Readonly<DetectorConfig>;
  /** Check a string. */
  check: (input: string) => CheckResult;
  /**
   * Check a text input, textarea, or contenteditable element. Checks on each
   * edit (`when: "onLiveChange"`) or on commit (`when: "onChange"`), and on
   * Enter. In strict mode, Enter with a secret is stopped before the app's own
   * handlers see it. Returns a function that removes the listeners.
   */
  attach: (field: SecretField, onResult?: (result: CheckResult) => void) => () => void;
};

export const initializeSecretDetector = (input?: Partial<DetectorConfig>): Detector => {
  const config = parseConfig(input ?? {});
  const check = (text: string): CheckResult => {
    const matches = findSecrets(text, config.rules);
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
            message: detailMessage(config.message, matches),
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
    check,
    attach: (field, onResult) =>
      attachToField(field, check, config.when === "onLiveChange" ? "input" : "change", onResult),
  };
};

const detailMessage = (template: string, matches: readonly SecretMatch[]) => {
  const labels = [...new Set(matches.map((match) => match.label))];
  // A function, so a "$" in a label is not read as a replacement pattern.
  return template.replaceAll("{labels}", () => labels.join(", "));
};
