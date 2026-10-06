/**
 * Turn one selected example into a rule.
 * A literal copy of the example would miss the next key from the same
 * provider, so the stable start is kept and the tail becomes a character class.
 * A key with no stable start, such as 32 hex characters, needs a keyword
 * instead: the rule then only counts next to that word.
 */

import { secretRules, type SecretRule } from "./rules.ts";

export type SecretBody = "letters-digits" | "digits" | "hex";

export type SecretShape = {
  label: string;
  prefix: string;
  body: SecretBody;
  minLength: number;
  keywords?: readonly string[];
};

const bodySource: Record<SecretBody, string> = {
  "letters-digits": "[A-Za-z0-9_-]",
  digits: "[0-9]",
  hex: "[0-9A-Fa-f]",
};

const minToken = 8;

export const suggestShape = (
  example: string,
): Pick<SecretShape, "prefix" | "body" | "minLength"> => {
  const token = example.trim();
  if (token.length === 0) throw new Error("Select the secret first.");
  if (/\s/.test(token)) {
    throw new Error("Select the secret without the surrounding words.");
  }

  const lastDelim = Math.max(token.lastIndexOf("-"), token.lastIndexOf("_"));
  if (lastDelim > 0 && lastDelim < token.length - 1 && stableHead(token, lastDelim)) {
    const rest = token.slice(lastDelim + 1);
    return {
      prefix: token.slice(0, lastDelim + 1),
      body: bodyKind(rest),
      minLength: rest.length,
    };
  }

  return { prefix: "", body: bodyKind(token), minLength: token.length };
};

export const ruleFromShape = (shape: SecretShape, example?: string): SecretRule => {
  const label = shape.label.trim();
  if (label.length === 0) throw new Error("Name the secret.");
  const keywords = (shape.keywords ?? [])
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
  if (shape.prefix.length === 0 && keywords.length === 0) {
    throw new Error(
      "Add a prefix or a keyword. A shape with neither would flag every word of that length.",
    );
  }
  if (
    !Number.isInteger(shape.minLength) ||
    shape.minLength < 1 ||
    shape.prefix.length + shape.minLength < minToken
  ) {
    throw new Error(`Prefix length plus minimum length must be at least ${minToken}.`);
  }
  const body = bodySource[shape.body];
  if (body === undefined) throw new Error("Unknown body shape.");

  const source = String.raw`${escapeRegex(shape.prefix)}${body}{${shape.minLength},}`;
  if (example !== undefined && !new RegExp(`^(?:${source})$`).test(example)) {
    throw new Error(
      "This shape does not match the example. The body class cannot express characters such as + / = .",
    );
  }

  const rule = ruleId(label);
  const base = { rule, label, source };
  return keywords.length === 0 ? base : { ...base, keywords };
};

// A random head (a digit, or both cases) is one specific key. Keep the split
// only when the head is a plain prefix, or the single break sits early.
const stableHead = (token: string, lastDelim: number) => {
  const head = token.slice(0, lastDelim);
  const plain = !/\d/.test(head) && !(/[A-Z]/.test(head) && /[a-z]/.test(head));
  const early = token.split(/[-_]/).length === 2 && lastDelim < minToken;
  return plain || early;
};

const bodyKind = (rest: string): SecretBody => {
  if (/^[0-9]+$/.test(rest)) return "digits";
  if (/^[0-9A-Fa-f]+$/.test(rest) && /[A-Fa-f]/.test(rest)) return "hex";
  return "letters-digits";
};

const slug = (label: string) =>
  label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const hashLabel = (label: string) => {
  let hash = 2166136261;
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const ruleId = (label: string) => {
  const slugged = slug(label);
  const id = slugged || hashLabel(label);
  if (!secretRules.some((item) => item.rule === id)) return id;
  const alt = slugged ? `${slugged}-2` : `${id}-2`;
  return secretRules.some((item) => item.rule === alt) ? hashLabel(label) : alt;
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
