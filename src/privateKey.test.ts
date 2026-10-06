import { beforeAll, describe, expect, it } from "vitest";
import { initializeSecretDetector } from "./detector.ts";
import { secretRules } from "./rules.ts";
import { secretTokens } from "./scan.ts";

// A real key, made for each run so the repo holds no private key.
const wrap = (der: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(der)))
    .replace(/(.{64})/g, "$1\n")
    .trimEnd();

const block = (label: string, body: string) =>
  `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;

let body = "";
let publicBody = "";
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 1024,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  body = wrap(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  publicBody = wrap(await crypto.subtle.exportKey("spki", pair.publicKey));
});

const found = (input: string) => secretTokens(input, secretRules);

describe("private key block", () => {
  it("flags the whole block and nothing after it", () => {
    const key = block("PRIVATE KEY", body);
    const input = `here is my key:\n${key}\nplease review it`;
    const matches = found(input);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ rule: "private-key", label: "Private key" });
    expect(input.slice(matches[0]?.start, matches[0]?.end)).toBe(key);
  });

  it.each([
    "PRIVATE KEY",
    "RSA PRIVATE KEY",
    "EC PRIVATE KEY",
    "DSA PRIVATE KEY",
    "OPENSSH PRIVATE KEY",
    "ENCRYPTED PRIVATE KEY",
    "PGP PRIVATE KEY BLOCK",
  ])("flags a %s", (label) => {
    const key = block(label, body);
    expect(found(`use this\n${key}`).map((match) => match.text)).toEqual([key]);
  });

  it("flags a key that was cut off before the footer", () => {
    const cut = `-----BEGIN PRIVATE KEY-----\n${body.slice(0, 200)}`;
    expect(found(cut)).toHaveLength(1);
  });

  it("flags a key whose line breaks became spaces", () => {
    const flat = block("RSA PRIVATE KEY", body).replace(/\n/g, " ");
    expect(found(`key: ${flat}`).map((match) => match.text)).toEqual([flat]);
  });

  it("flags a key inside JSON, where line breaks are a literal \\n", () => {
    const key = block("PRIVATE KEY", body);
    const json = JSON.stringify({ type: "service_account", private_key: key });
    expect(json).toContain("\\n");
    const [match] = found(json);
    expect(match?.rule).toBe("private-key");
    expect(match?.text).toBe(JSON.stringify(key).slice(1, -1));
  });

  it("flags two keys separately", () => {
    const key = block("PRIVATE KEY", body);
    expect(found(`${key}\n\nand another\n${key}`)).toHaveLength(2);
  });

  it("does not flag a public key or a certificate", () => {
    expect(found(block("PUBLIC KEY", publicBody))).toEqual([]);
    expect(found(block("CERTIFICATE", publicBody))).toEqual([]);
  });

  it("does not flag a sentence that only names the header", () => {
    expect(found("what does -----BEGIN RSA PRIVATE KEY----- mean?")).toEqual([]);
    expect(
      found("my file starts with -----BEGIN PRIVATE KEY----- and ends with -----END PRIVATE KEY-----"),
    ).toEqual([]);
  });

  it("refuses the send and does not return the key in boolean mode", () => {
    const key = block("PRIVATE KEY", body);
    const strict = initializeSecretDetector();
    expect(strict.onChange(`my key\n${key}`)).toMatchObject({
      pass: false,
      allowSend: false,
    });
    const quiet = initializeSecretDetector({ report: "boolean" }).onChange(key);
    expect(quiet).toEqual({ pass: false, allowSend: false, report: "boolean" });
    expect(JSON.stringify(quiet)).not.toContain(body.slice(0, 40));
  });

  it("keeps the text scope when the config goes through JSON", () => {
    const detector = initializeSecretDetector();
    const again = initializeSecretDetector(JSON.parse(JSON.stringify(detector.config)));
    const key = block("PRIVATE KEY", body);
    expect(again.onChange(key).pass).toBe(false);
  });

  it("rejects an unknown scope", () => {
    const rule = { rule: "a", label: "A", source: "a+", scope: "line" };
    expect(() => initializeSecretDetector({ rules: [rule] })).toThrow(/rule/);
  });
});
