/**
 * Split a sentence into tokens, then ask each token if it is a secret.
 * The first matching rule wins, so a more specific prefix stays above a
 * broader one. A secret glued into a larger word is a different token and
 * is not reported.
 */

import type { SecretRule } from "./rules.ts";

export type TextToken = {
  text: string;
  start: number;
  end: number;
};

export type SecretMatch = TextToken & {
  rule: string;
  label: string;
};

const edgePunctuation = new Set(".,;:!?\"'`()[]{}<>");

export const tokensOf = (input: string): TextToken[] => {
  const tokens: TextToken[] = [];
  for (const match of input.matchAll(/\S+/g)) {
    const raw = match[0];
    const rawStart = match.index;
    if (rawStart === undefined) continue;
    const token = trimEdges(raw, rawStart);
    if (token.text.length === 0) continue;
    tokens.push(token);
  }
  return tokens;
};

export const secretTokens = (
  input: string,
  rules: readonly SecretRule[],
): SecretMatch[] => {
  if (rules.length === 0) return [];
  const found: SecretMatch[] = [];
  for (const token of tokensOf(input)) {
    for (const rule of rules) {
      if (!tokenIsRule(token.text, rule)) continue;
      found.push({ ...token, rule: rule.rule, label: rule.label });
      break;
    }
  }
  return found;
};

const tokenIsRule = (token: string, rule: SecretRule) =>
  new RegExp(`^(?:${rule.source})$`).test(token);

const trimEdges = (raw: string, rawStart: number): TextToken => {
  let start = 0;
  let end = raw.length;
  while (start < end && edgePunctuation.has(raw.charAt(start))) start += 1;
  while (end > start && edgePunctuation.has(raw.charAt(end - 1))) end -= 1;
  return {
    text: raw.slice(start, end),
    start: rawStart + start,
    end: rawStart + end,
  };
};
