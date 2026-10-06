/**
 * Known secret shapes for a browser composer scan.
 *
 * Each source is tested against one whole token, so it needs no ^, $ or \b.
 * The first matching rule wins. Keep a specific prefix above a broader one:
 * sk-ant- and sk-or-v1- stay above openai, and jwt stays above discord-bot.
 *
 * Most rules are a prefix. A shape too generic to flag alone, such as 32 hex
 * characters, carries keywords and only counts next to the provider's name.
 * A password or a custom key with no known prefix is outside this list.
 * That ceiling is intentional: high-entropy guessing flags ordinary sentences.
 *
 * Shapes were checked against the default ruleset of gitleaks (MIT):
 * https://github.com/gitleaks/gitleaks
 */

export type SecretRule = {
  rule: string;
  label: string;
  source: string;
  /**
   * The rule only matches when one of these appears, case-insensitive, in a
   * token within a few tokens of the candidate. Use it for shapes that are
   * too generic to flag alone, such as 32 hex characters.
   */
  keywords?: readonly string[];
  /**
   * "token" (default): the source must match one whole token.
   * "text": the source is searched in the whole input, for secrets that span
   * tokens, such as a PEM private key block. It is not anchored.
   */
  scope?: "token" | "text";
};

// A PEM block spans many tokens. Its lines may be separated by real newlines
// or by a literal \n, as in a JSON service account file.
const sep = String.raw`(?:\s|\\[nr])`;
const b64 = "[A-Za-z0-9+/=]";
const privateKeyBlock = String.raw`-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----${sep}*${b64}{20,}(?:${sep}+${b64}{16,})*(?:(?:${sep}+${b64}+)?${sep}*-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----)?`;

export const secretRules: readonly SecretRule[] = [
  // AI providers. sk- is broad, so the specific ones come first.
  { rule: "anthropic", label: "Anthropic API key", source: String.raw`sk-ant-[A-Za-z0-9_-]{20,}` },
  { rule: "openrouter", label: "OpenRouter API key", source: String.raw`sk-or-v1-[a-f0-9]{64}` },
  { rule: "openai", label: "OpenAI API key", source: String.raw`sk-(?:proj-)?[A-Za-z0-9_-]{20,}` },
  { rule: "groq", label: "Groq API key", source: String.raw`gsk_[A-Za-z0-9]{52}` },
  { rule: "xai", label: "xAI API key", source: String.raw`xai-[A-Za-z0-9]{80}` },
  { rule: "perplexity", label: "Perplexity API key", source: String.raw`pplx-[A-Za-z0-9]{48}` },
  { rule: "huggingface", label: "Hugging Face token", source: String.raw`(?:hf|api_org)_[A-Za-z]{34}` },
  { rule: "replicate", label: "Replicate API token", source: String.raw`r8_[A-Za-z0-9]{37}` },
  { rule: "google-api-key", label: "Google API key", source: String.raw`AIza[A-Za-z0-9_-]{35}` },
  { rule: "google-oauth-secret", label: "Google OAuth client secret", source: String.raw`GOCSPX-[A-Za-z0-9_-]{28}` },

  // Cloud and hosting.
  { rule: "aws-access-key", label: "AWS access key", source: String.raw`(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}` },
  { rule: "digitalocean", label: "DigitalOcean token", source: String.raw`do[opr]_v1_[a-f0-9]{64}` },
  { rule: "fly-io", label: "Fly.io access token", source: String.raw`fo1_[A-Za-z0-9_-]{43}` },
  { rule: "heroku", label: "Heroku API key", source: String.raw`HRKU-AA[A-Za-z0-9_-]{58}` },
  { rule: "supabase", label: "Supabase access token", source: String.raw`sbp_[a-f0-9]{40}` },
  { rule: "databricks", label: "Databricks API token", source: String.raw`dapi[a-f0-9]{32}(?:-\d)?` },
  { rule: "doppler", label: "Doppler API token", source: String.raw`dp\.pt\.[A-Za-z0-9]{43}` },
  { rule: "grafana-service-account", label: "Grafana service account token", source: String.raw`glsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8}` },
  { rule: "age-secret-key", label: "age secret key", source: String.raw`AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}` },

  // Source hosting, packages, developer tools.
  { rule: "github-token", label: "GitHub token", source: String.raw`(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}` },
  { rule: "github-fine-grained-pat", label: "GitHub fine-grained token", source: String.raw`github_pat_[A-Za-z0-9_]{82}` },
  { rule: "gitlab-pat", label: "GitLab personal access token", source: String.raw`glpat-[A-Za-z0-9_-]{20,}` },
  { rule: "npm-token", label: "npm access token", source: String.raw`npm_[A-Za-z0-9]{36}` },
  { rule: "pypi-token", label: "PyPI upload token", source: String.raw`pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}` },
  { rule: "postman", label: "Postman API token", source: String.raw`PMAK-[A-Fa-f0-9]{24}-[A-Fa-f0-9]{34}` },
  { rule: "linear", label: "Linear API key", source: String.raw`lin_api_[A-Za-z0-9]{40}` },
  { rule: "atlassian", label: "Atlassian API token", source: String.raw`ATATT3[A-Za-z0-9_=-]{186}` },
  { rule: "shopify", label: "Shopify access token", source: String.raw`shp(?:at|ss|ca|pa)_[A-Fa-f0-9]{32}` },

  // Messaging and payments.
  { rule: "slack", label: "Slack token", source: String.raw`xox[baprs]-[A-Za-z0-9-]{10,}` },
  { rule: "slack-app-token", label: "Slack app token", source: String.raw`xapp-\d-[A-Za-z0-9]{9,}-\d{10,}-[A-Za-z0-9]{64}` },
  { rule: "slack-webhook", label: "Slack webhook URL", source: String.raw`https:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+\/]{43,56}` },
  { rule: "stripe-live", label: "Stripe live secret key", source: String.raw`(?:sk|rk)_(?:live|prod)_[A-Za-z0-9]{10,99}` },
  { rule: "sendgrid", label: "SendGrid API key", source: String.raw`SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}` },
  { rule: "twilio", label: "Twilio API key", source: String.raw`SK[0-9a-f]{32}` },
  { rule: "square", label: "Square access token", source: String.raw`(?:EAAA[A-Za-z0-9_-]{60}|sq0(?:atp|csp)-[A-Za-z0-9_-]{22,43})` },
  { rule: "telegram-bot", label: "Telegram bot token", source: String.raw`[0-9]{8,10}:[A-Za-z0-9_-]{35}` },
  // jwt must stay above discord-bot: both are three dot-separated parts.
  { rule: "jwt", label: "JSON Web Token", source: String.raw`eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` },
  { rule: "discord-bot", label: "Discord bot token", source: String.raw`[MNO][A-Za-z0-9_-]{23,25}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}` },

  // Generic shapes that only count next to the provider's name, in the same
  // sentence: "mailgun key-<32 hex>" or MAILGUN_API_KEY=key-<32 hex>.
  { rule: "mailgun-key", label: "Mailgun key", keywords: ["mailgun"], source: String.raw`(?:(?:pub)?key-[A-Fa-f0-9]{32}|[a-h0-9]{32}-[a-h0-9]{8}-[a-h0-9]{8})` },
  { rule: "heroku-api-key", label: "Heroku API key", keywords: ["heroku"], source: String.raw`[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}` },
  { rule: "hubspot-api-key", label: "HubSpot API key", keywords: ["hubspot"], source: String.raw`[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}` },
  { rule: "cloudflare-key", label: "Cloudflare API key", keywords: ["cloudflare"], source: String.raw`(?:[A-Za-z0-9_-]{40}|[A-Fa-f0-9]{37})` },
  { rule: "discord-secret", label: "Discord secret", keywords: ["discord"], source: String.raw`(?:[A-Fa-f0-9]{64}|[A-Za-z0-9=_-]{32})` },
  { rule: "netlify-token", label: "Netlify access token", keywords: ["netlify"], source: String.raw`[A-Za-z0-9=_-]{40,46}` },
  { rule: "sentry-token", label: "Sentry access token", keywords: ["sentry"], source: String.raw`[A-Fa-f0-9]{64}` },
  { rule: "bitbucket-secret", label: "Bitbucket client secret", keywords: ["bitbucket"], source: String.raw`(?:[A-Za-z0-9]{32}|[A-Za-z0-9=_-]{64})` },
  { rule: "codecov-token", label: "Codecov access token", keywords: ["codecov"], source: String.raw`[A-Za-z0-9]{32}` },
  { rule: "okta-token", label: "Okta access token", keywords: ["okta"], source: String.raw`00[A-Za-z0-9=_-]{40}` },
  { rule: "launchdarkly-token", label: "LaunchDarkly access token", keywords: ["launchdarkly"], source: String.raw`[A-Za-z0-9=_-]{40}` },

  // Needs the header and at least 20 base64 characters after it, so a question
  // that only names "-----BEGIN RSA PRIVATE KEY-----" is not flagged. The
  // footer is optional: a paste that was cut off is still a leaked key.
  { rule: "private-key", label: "Private key", scope: "text", source: privateKeyBlock },

  // Credentials inside a URL.
  { rule: "database-url", label: "Database connection string", source: String.raw`(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s'"<>]+:[^\s'"<>]+@\S+` },
  { rule: "url-with-password", label: "URL with a password", source: String.raw`https?:\/\/[^\s:\/@'"<>]+:[^\s\/@'"<>]+@\S+` },
];
