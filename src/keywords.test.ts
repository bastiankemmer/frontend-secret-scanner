import { describe, expect, it } from "vitest";
import { initializeSecretDetector, type DetectorConfig } from "./detector.ts";
import { secretRules } from "./rules.ts";
import { keywordWindow, findSecrets } from "./scan.ts";
import { ruleFromShape, suggestShape } from "./shape.ts";

const mailgunKey = `key-${"a".repeat(32)}`;

describe("keyword rules", () => {
  it("says nothing about a sentence that names mailgun but holds no key", () => {
    expect(findSecrets("this is my key for mailgun XYZ", secretRules)).toEqual([]);
  });

  it("flags the key when mailgun is in the sentence", () => {
    const input = `this is my key for mailgun ${mailgunKey}`;
    const [match] = findSecrets(input, secretRules);
    expect(match).toMatchObject({ rule: "mailgun-key", label: "Mailgun key" });
    expect(input.slice(match?.start, match?.end)).toBe(mailgunKey);
  });

  it("ignores the same shape when no keyword is near", () => {
    expect(findSecrets(`this is my key ${mailgunKey}`, secretRules)).toEqual([]);
  });

  it("matches the keyword in any case and inside a longer word", () => {
    expect(findSecrets(`Mailgun: ${mailgunKey}`, secretRules)).toHaveLength(1);
    expect(findSecrets(`MAILGUN_API_KEY=${mailgunKey}`, secretRules)).toHaveLength(1);
  });

  it("reports the value, not the NAME= part", () => {
    const input = `MAILGUN_API_KEY=${mailgunKey}`;
    const [match] = findSecrets(input, secretRules);
    expect(match?.text).toBe(mailgunKey);
    expect(input.slice(match?.start, match?.end)).toBe(mailgunKey);
  });

  it("ignores a keyword that is too far away", () => {
    const filler = Array.from({ length: keywordWindow + 1 }, () => "word").join(" ");
    expect(findSecrets(`mailgun ${filler} ${mailgunKey}`, secretRules)).toEqual([]);
    const near = Array.from({ length: keywordWindow - 1 }, () => "word").join(" ");
    expect(findSecrets(`mailgun ${near} ${mailgunKey}`, secretRules)).toHaveLength(1);
  });

  it("lets a prefix rule win without needing a keyword", () => {
    const [match] = findSecrets(`mailgun sk-ant-${"a".repeat(20)}`, secretRules);
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
    expect(detector.check(`my acme key is ${sibling}`).pass).toBe(false);
    expect(detector.check(`my key is ${sibling}`).pass).toBe(true);
  });

  it("keeps keywords when the config goes through JSON", () => {
    const detector = initializeSecretDetector();
    const again = initializeSecretDetector(JSON.parse(JSON.stringify(detector.config)));
    const text = `this is my key for mailgun ${mailgunKey}`;
    expect(again.check(text)).toEqual(detector.check(text));
    expect(again.check(text).pass).toBe(false);
  });

  it("rejects keywords that are not a list of words", () => {
    const rule = { rule: "a", label: "A", source: "a+" };
    const init = (input: unknown) => initializeSecretDetector(input as Partial<DetectorConfig>);
    expect(() => init({ rules: [{ ...rule, keywords: "acme" }] })).toThrow(/rule/);
    expect(() => init({ rules: [{ ...rule, keywords: [" "] }] })).toThrow(/rule/);
  });
});
