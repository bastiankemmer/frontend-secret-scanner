/**
 * Turn one selected example into a rule.
 * A literal copy of the example would miss the next key from the same
 * provider, so the stable start is kept and the tail becomes a character class.
 * A key with no stable start, such as 32 hex characters, needs a keyword
 * instead: the rule then only counts next to that word.
 */

import type { SecretRule } from "./rules.ts";

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

export const suggestShape = (
  example: string,
): Pick<SecretShape, "prefix" | "body" | "minLength"> => {
  const token = example.trim();
  if (token.length === 0) throw new Error("Select the secret first.");
  if (/\s/.test(token)) {
    throw new Error("Select the secret without the surrounding words.");
  }

  const lastDelim = Math.max(token.lastIndexOf("-"), token.lastIndexOf("_"));
  if (lastDelim > 0 && lastDelim < token.length - 1) {
    const rest = token.slice(lastDelim + 1);
    return {
      prefix: token.slice(0, lastDelim + 1),
      body: bodyKind(rest),
      minLength: rest.length,
    };
  }

  // Four leading letters are a prefix, unless the whole token is hex: then
  // they are just the first hex digits of a key with no prefix.
  const leading = /^[A-Za-z]{4}/.exec(token);
  if (leading && token.length > leading[0].length && !/^[0-9A-Fa-f]+$/.test(token)) {
    const rest = token.slice(leading[0].length);
    return {
      prefix: leading[0],
      body: bodyKind(rest),
      minLength: rest.length,
    };
  }

  return { prefix: "", body: bodyKind(token), minLength: token.length };
};

export const ruleFromShape = (shape: SecretShape): SecretRule => {
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
  if (!Number.isInteger(shape.minLength) || shape.minLength < 1) {
    throw new Error("Minimum length must be at least 1.");
  }
  const body = bodySource[shape.body];
  if (body === undefined) throw new Error("Unknown body shape.");

  const rule = slug(label);
  if (rule.length === 0) throw new Error("Name the secret.");
  const base = {
    rule,
    label,
    source: String.raw`${escapeRegex(shape.prefix)}${body}{${shape.minLength},}`,
  };
  return keywords.length === 0 ? base : { ...base, keywords };
};

const bodyKind = (rest: string): SecretBody => {
  if (/^[0-9]+$/.test(rest)) return "digits";
  if (/^[0-9A-Fa-f]+$/.test(rest) && /[A-Fa-f]/.test(rest)) return "hex";
  return "letters-digits";
};

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
