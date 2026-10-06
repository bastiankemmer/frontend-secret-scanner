import { describe, expect, it } from "vitest";
import { initializeSecretDetector } from "./detector.ts";
import { secretRules } from "./rules.ts";
import { keywordWindow, secretTokens } from "./scan.ts";
import { ruleFromShape, suggestShape } from "./shape.ts";

const mailgunKey = `key-${"a".repeat(32)}`;

describe("keyword rules", () => {
  it("says nothing about a sentence that names mailgun but holds no key", () => {
    expect(secretTokens("this is my key for mailgun XYZ", secretRules)).toEqual([]);
  });

  it("flags the key when mailgun is in the sentence", () => {
    const input = `this is my key for mailgun ${mailgunKey}`;
    const [match] = secretTokens(input, secretRules);
    expect(match).toMatchObject({ rule: "mailgun-key", label: "Mailgun key" });
    expect(input.slice(match?.start, match?.end)).toBe(mailgunKey);
  });

  it("ignores the same shape when no keyword is near", () => {
    expect(secretTokens(`this is my key ${mailgunKey}`, secretRules)).toEqual([]);
  });

  it("matches the keyword in any case and inside a longer word", () => {
    expect(secretTokens(`Mailgun: ${mailgunKey}`, secretRules)).toHaveLength(1);
    expect(secretTokens(`MAILGUN_API_KEY=${mailgunKey}`, secretRules)).toHaveLength(1);
  });

  it("reports the value, not the NAME= part", () => {
    const input = `MAILGUN_API_KEY=${mailgunKey}`;
    const [match] = secretTokens(input, secretRules);
    expect(match?.text).toBe(mailgunKey);
    expect(input.slice(match?.start, match?.end)).toBe(mailgunKey);
  });

  it("ignores a keyword that is too far away", () => {
    const filler = Array.from({ length: keywordWindow + 1 }, () => "word").join(" ");
    expect(secretTokens(`mailgun ${filler} ${mailgunKey}`, secretRules)).toEqual([]);
    const near = Array.from({ length: keywordWindow - 1 }, () => "word").join(" ");
    expect(secretTokens(`mailgun ${near} ${mailgunKey}`, secretRules)).toHaveLength(1);
  });

  it("lets a prefix rule win without needing a keyword", () => {
    const [match] = secretTokens(`mailgun sk-ant-${"a".repeat(20)}`, secretRules);
    expect(match?.rule).toBe("anthropic");
  });
});

describe("learning a keyword rule from a typed sentence", () => {
  it("needs a keyword when the key has no prefix", () => {
    const example = "0123456789abcdef0123456789abcdef";
    const shape = suggestShape(example);
    expect(shape).toEqual({ prefix: "", body: "hex", minLength: 32 });
    expect(() => ruleFromShape({ label: "Acme key", ...shape })).toThrow(/prefix or a keyword/);
  });

  it("flags the next key from that provider only near the keyword", () => {
    const shape = suggestShape("0123456789abcdef0123456789abcdef");
    const rule = ruleFromShape({ label: "Acme key", ...shape, keywords: [" acme "] });
    expect(rule.keywords).toEqual(["acme"]);

    const detector = initializeSecretDetector({ rules: [rule] });
    const sibling = "fedcba9876543210fedcba9876543210";
    expect(detector.onChange(`my acme key is ${sibling}`).pass).toBe(false);
    expect(detector.onChange(`my key is ${sibling}`).pass).toBe(true);
  });

  it("keeps keywords when the config goes through JSON", () => {
    const detector = initializeSecretDetector();
    const again = initializeSecretDetector(JSON.parse(JSON.stringify(detector.config)));
    const text = `this is my key for mailgun ${mailgunKey}`;
    expect(again.onChange(text)).toEqual(detector.onChange(text));
    expect(again.onChange(text).pass).toBe(false);
  });

  it("rejects keywords that are not a list of words", () => {
    const rule = { rule: "a", label: "A", source: "a+" };
    expect(() => initializeSecretDetector({ rules: [{ ...rule, keywords: "acme" }] })).toThrow(/rule/);
    expect(() => initializeSecretDetector({ rules: [{ ...rule, keywords: [" "] }] })).toThrow(/rule/);
  });
});
