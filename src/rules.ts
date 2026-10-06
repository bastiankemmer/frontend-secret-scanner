/**
 * Known secret shapes for a browser composer scan.
 * A password or a custom key with no known prefix is outside this list.
 * That ceiling is intentional: high-entropy guessing flags ordinary sentences.
 */

export type SecretRule = {
  rule: string;
  label: string;
  source: string;
};

export const secretRules: readonly SecretRule[] = [
  {
    rule: "anthropic",
    label: "Anthropic API key",
    source: String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}\b`,
  },
  {
    rule: "openai",
    label: "OpenAI API key",
    source: String.raw`\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b`,
  },
  {
    rule: "aws-access-key",
    label: "AWS access key",
    source: String.raw`\bAKIA[0-9A-Z]{16}\b`,
  },
  {
    rule: "github-pat",
    label: "GitHub personal access token",
    source: String.raw`\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}\b`,
  },
  {
    rule: "stripe-live",
    label: "Stripe live secret key",
    source: String.raw`\b(?:sk|rk)_live_[A-Za-z0-9]{10,}\b`,
  },
  {
    rule: "slack",
    label: "Slack token",
    source: String.raw`\bxox[baprs]-[A-Za-z0-9-]{10,}\b`,
  },
  {
    rule: "jwt",
    label: "JSON Web Token",
    source: String.raw`\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b`,
  },
  {
    rule: "database-url",
    label: "Database connection string",
    source: String.raw`\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"<>]+:[^\s'"<>]+@\S+`,
  },
];
