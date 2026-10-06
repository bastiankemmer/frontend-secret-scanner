# frontend-secret-scanner

Browser-side check for text a person is about to send. The sentence is split into tokens. If a token matches a known secret shape, the caller keeps that text on the client and tells them not to send it.

The package does not draw UI. The host app calls `onLiveChange` or `onChange` and shows the result.

## Install

```bash
npm install frontend-secret-scanner
```

The package is plain JavaScript with type declarations. It uses no Node APIs and runs in the browser.

## Develop

Node `^20.19.0` or `>=22.12.0`.

```bash
git clone https://github.com/bastiankemmer/frontend-secret-scanner.git
cd frontend-secret-scanner
npm install
```

## Use

Initialize a detector. With no config, it uses the default checklist, strict mode, detailed results, and `onChange`.

```ts
import { initializeSecretDetector } from "frontend-secret-scanner";

const detector = initializeSecretDetector();

input.addEventListener("change", () => {
  const result = detector.onChange(input.value);
  if (!result.allowSend) {
    // Show a warning. Do not POST the text.
  }
});
```

`onLiveChange` is the same check for an `input` event. Set `when` to record which one the app should call.

```ts
const detector = initializeSecretDetector({
  strict: true,
  when: "onLiveChange",
  report: "boolean",
  rules: [],
});
```

`strict: true` sets `allowSend` to false when a token is a secret. `strict: false` still reports the secret and sets `allowSend` to true.

`report: "detail"` adds an error with the rule label and the token span. The message does not repeat the secret. `report: "boolean"` returns `{ pass, allowSend }` and does not include the token.

`rules` replaces the checklist. Omit it to use the built-in shapes.

## What a token can be

52 known shapes, in `src/rules.ts`. The bundle is about 3.8 kB gzipped with no dependencies.

- **AI providers:** Anthropic, OpenAI, OpenRouter, Groq, xAI, Perplexity, Hugging Face, Replicate, Google API key and OAuth secret
- **Cloud and hosting:** AWS, DigitalOcean, Fly.io, Heroku, Supabase, Databricks, Doppler, Grafana, age
- **Source and packages:** GitHub (classic and fine-grained), GitLab, npm, PyPI, Postman, Linear, Atlassian, Shopify
- **Messaging and payments:** Slack (bot, app, webhook), Stripe live, SendGrid, Twilio, Square, Telegram bot, Discord bot, JSON Web Token
- **Private keys:** PEM blocks (`PRIVATE KEY`, `RSA`, `EC`, `DSA`, `OPENSSH`, `ENCRYPTED`, `PGP`)
- **Passwords in a URL:** database connection strings and `https://user:password@host`
- **Generic keys that need a keyword:** Mailgun, Heroku, HubSpot, Cloudflare, Discord, Netlify, Sentry, Bitbucket, Codecov, Okta, LaunchDarkly

Shapes were checked against the default rules of [gitleaks](https://github.com/gitleaks/gitleaks) (MIT).

### Private keys

A private key spans many tokens, so it has a rule with `scope: "text"`, which is searched in the whole input instead of one token. It needs the `-----BEGIN ... PRIVATE KEY-----` header and at least 20 base64 characters after it. The footer is optional, because a paste cut off halfway is still a leaked key. These are flagged:

- a normal multi-line block, one with its line breaks turned into spaces, and one inside JSON where they are a literal `\n`, as in a cloud service account file
- the whole block is one match, so the result points at all of it and the tokens inside are not reported again

These are not: a public key, a certificate, and a sentence that only names the header, like "what does -----BEGIN RSA PRIVATE KEY----- mean?".

### Keyword rules

A key like `key-` plus 32 hex characters is too generic to flag on its own. A rule with `keywords` only matches when one of them appears, in any case, within 8 tokens of the key:

```
this is my key for mailgun key-0123...   flagged
this is my key for mailgun XYZ           not flagged, XYZ has no key shape
this is my key 0123...                   not flagged, no keyword near it
```

The rule checks the shape of the key, not the words around it. Warning on "mailgun" plus the word "key" alone would flag every question about Mailgun.

A key pasted as `NAME=value`, JSON (`"apiKey":"..."`) or a URL query (`?token=...`) is one token. The part after `=`, `:`, a quote or a comma is checked too, and the result points at the value only.

Not detected:

- A password, or a custom key with no known prefix. Guessing from entropy flags ordinary words, so that is not the approach.
- A secret stuck to another word. That is a different token and is not reported.

To cover a provider that is missing, click its key on the config page. A key with a stable start gets a prefix. A key without one gets a keyword, such as the provider name. Or pass your own `rules`:

```ts
initializeSecretDetector({
  rules: [{ rule: "acme", label: "Acme key", keywords: ["acme"], source: "[a-f0-9]{32}" }],
});
```

`source` is a regular expression for one whole token, with no `^`, `$` or `\b`.

## Config page

```bash
npm run demo
```

Vite prints a local URL. Type a sentence, check the tokens, turn strict mode and the result shape on or off, and add a shape from a token that the checklist missed. Build copies a config object for `initializeSecretDetector`.

## Speed

Default detector, all 52 rules, `npm run benchmark` on an Apple M4 with Node 24:

| Input | Time per check |
| --- | --- |
| Sentence, 12 words | 0.02 ms |
| Chat message, 100 words | 0.12 ms |
| Paste, 1,000 words | 1.1 ms |
| Document, 10,000 words | 11 ms |
| Document, 100,000 words | 120 ms |

Time grows in a straight line with the input: about 1.1 ms per 1,000 words, whether or not a secret is in it. A private key adds about 0.1 ms. Worst-case shapes (one 100 kB token, 20,000 delimiters in one token, 5,000 private key headers with no body) take 0.6 to 26 ms, and doubling them doubles the time. Run `onLiveChange` on every keystroke for chat-sized input; for very large pastes, use `onChange`.

## Scripts

```bash
npm test
npm run typecheck
npm run build   # emits dist/
npm run benchmark   # speed of the full suite, one rule at a time, worst cases
npm run demo
```

## License

MIT. See `LICENSE`.

## Publishing

Publishing is automatic. Creating a GitHub release runs `.github/workflows/publish.yml`, which tests, builds, and runs `npm publish` with provenance. It uses npm trusted publishing, so there is no npm token. `ci.yml` runs the same checks on every push to `main` and on pull requests.

One-time setup (a trusted publisher can only be added to a package that already exists):

1. Publish the first version by hand: `npm login`, then `npm publish`.
2. On npmjs.com, open the package, Settings, Trusted publishing, choose GitHub Actions: user `bastiankemmer`, repository `frontend-secret-scanner`, workflow `publish.yml`.
3. Optional: under Publishing access, choose "Require two-factor authentication and disallow tokens".

Per release:

1. Set `version` in `package.json` and merge it.
2. Create a GitHub release with the tag `v<version>`, for example `v0.2.0`. The workflow fails if the tag and `package.json` differ.
