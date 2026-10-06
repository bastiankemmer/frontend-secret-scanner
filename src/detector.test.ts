import { describe, expect, it } from "vitest";
import { initializeSecretDetector, type DetectorConfig } from "./detector.ts";
import { secretRules, type SecretRule } from "./rules.ts";

const openaiKey = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
const sentence = `use ${openaiKey} for the call`;

describe("initializeSecretDetector", () => {
  it("uses the default checklist when no config is passed", () => {
    const detector = initializeSecretDetector();
    const result = detector.check("please add an API key");
    expect(result).toEqual({ pass: true, allowSend: true, report: "detail" });
    expect(detector.config.strict).toBe(true);
    expect(detector.config.when).toBe("onChange");
    expect(detector.config.rules.map((rule) => rule.rule)).toEqual(
      secretRules.map((rule) => rule.rule),
    );
  });

  it("refuses send in strict mode and names the token label", () => {
    const result = initializeSecretDetector().check(sentence);
    expect(result.pass).toBe(false);
    expect(result.allowSend).toBe(false);
    if (result.pass || result.report !== "detail") {
      throw new Error("expected a detailed failure");
    }
    expect(result.error.message).toBe(
      "Don't send secrets. This looks like: OpenAI API key.",
    );
    expect(result.error.message).not.toContain(openaiKey);
    expect(result.error.matches[0]?.text).toBe(openaiKey);
  });

  it("uses the message from the config, with the kind of key filled in", () => {
    const own = initializeSecretDetector({ message: "Stop: {labels}! ({labels})" }).check(sentence);
    if (own.pass || own.report !== "detail") throw new Error("expected a detailed failure");
    expect(own.error.message).toBe("Stop: OpenAI API key! (OpenAI API key)");
    const plain = initializeSecretDetector({ message: "No secrets here." }).check(sentence);
    if (plain.pass || plain.report !== "detail") throw new Error("expected a detailed failure");
    expect(plain.error.message).toBe("No secrets here.");
  });

  it("keeps a dollar sign in a label as it is", () => {
    const rules = [{ rule: "x", label: "Pay$&ment", source: "zz[0-9]{6}" }];
    const result = initializeSecretDetector({ rules, message: "{labels}" }).check("zz123456");
    if (result.pass || result.report !== "detail") throw new Error("expected a detailed failure");
    expect(result.error.message).toBe("Pay$&ment");
  });

  it("allows send when strict mode is off", () => {
    const result = initializeSecretDetector({ strict: false }).check(
      sentence,
    );
    expect(result).toMatchObject({ pass: false, allowSend: true });
  });

  it("returns a boolean and leaves the secret out of the result", () => {
    const result = initializeSecretDetector({ report: "boolean" }).check(
      sentence,
    );
    expect(result).toEqual({
      pass: false,
      allowSend: false,
      report: "boolean",
    });
    expect(JSON.stringify(result)).not.toContain(openaiKey);
  });

  it("checks only the rules it was given", () => {
    const awsOnly = secretRules.filter((rule) => rule.rule === "aws-access-key");
    const detector = initializeSecretDetector({ rules: awsOnly });
    expect(detector.check(sentence).pass).toBe(true);
    expect(detector.check("key AKIAIOSFODNN7EXAMPLE in the env").pass).toBe(
      false,
    );
  });

  it("keeps the event choice in the config", () => {
    expect(initializeSecretDetector({ when: "onLiveChange" }).config.when).toBe("onLiveChange");
  });

  it("rebuilds from the config it exposes", () => {
    const detector = initializeSecretDetector({
      strict: false,
      when: "onLiveChange",
      report: "boolean",
      message: "Nope: {labels}",
    });
    const again = initializeSecretDetector(JSON.parse(JSON.stringify(detector.config)));
    expect(again.check(sentence)).toEqual(detector.check(sentence));
  });

  it("rejects a config that is not a detector config", () => {
    const init = (input: unknown) => initializeSecretDetector(input as Partial<DetectorConfig>);
    expect(() => init({ strict: "yes" })).toThrow(/strict/);
    expect(() => init({ when: "submit" })).toThrow(/when/);
    expect(() => init({ message: "" })).toThrow(/message/);
    expect(() => init({ message: 5 })).toThrow(/message/);
    expect(() => init([])).toThrow(/object/);
  });

  it("throws when the config names an unknown key", () => {
    expect(() => initializeSecretDetector({ strcit: true } as Partial<DetectorConfig>)).toThrow(
      /strcit/,
    );
  });

  it("freezes a copy of each rule so the next detector keeps the original source", () => {
    const first = initializeSecretDetector();
    const source = secretRules[0];
    const copy = first.config.rules[0];
    if (!source || !copy) throw new Error("expected a default rule");
    expect(copy).not.toBe(source);
    expect(copy.source).toBe(source.source);
    const keyword = secretRules.find((rule) => rule.keywords);
    const copiedKeyword = first.config.rules.find((rule) => rule.rule === keyword?.rule);
    if (!keyword?.keywords || !copiedKeyword?.keywords) {
      throw new Error("expected a keyword rule");
    }
    expect(copiedKeyword.keywords).not.toBe(keyword.keywords);
    expect(() => {
      copy.label = "changed";
    }).toThrow(TypeError);
    expect(() => {
      (copiedKeyword.keywords as string[]).push("nope");
    }).toThrow(TypeError);
    expect(() => {
      (first.config.rules as SecretRule[]).push({
        rule: "zz",
        label: "Zz",
        source: "z".repeat(8),
      });
    }).toThrow(TypeError);
    expect(() => {
      (first.config as { strict: boolean }).strict = false;
    }).toThrow(TypeError);
    const second = initializeSecretDetector();
    expect(second.config.rules.map((rule) => rule.source)).toEqual(
      secretRules.map((rule) => rule.source),
    );
    expect(secretRules[0]?.source).toBe(source.source);
  });

  it("rejects empty keywords, empty-matching patterns, and duplicate rule ids", () => {
    const rule = { rule: "acme", label: "Acme", source: "z".repeat(8) };
    expect(() => initializeSecretDetector({ rules: [{ ...rule, keywords: [] }] })).toThrow(
      /empty keywords/,
    );
    expect(() => initializeSecretDetector({ rules: [{ ...rule, source: "x*" }] })).toThrow(
      /empty string/,
    );
    expect(() =>
      initializeSecretDetector({ rules: [rule, { ...rule, label: "Acme again" }] }),
    ).toThrow(/Duplicate rule id: acme/);
  });

  it("allows a config with no rules", () => {
    expect(initializeSecretDetector({ rules: [] }).check("plain text").pass).toBe(true);
  });
});
