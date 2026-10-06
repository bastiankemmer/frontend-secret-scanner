/**
 * Config page for the detector. It tokenizes a sentence, shows which tokens
 * are secrets, and builds the config the host app will initialize with.
 * The host app still draws its own warning. This page does not.
 */

import { initializeSecretDetector, secretRules } from "../src/index.ts";
import type {
  CheckResult,
  DetectorReport,
  DetectorWhen,
  SecretRule,
} from "../src/index.ts";
import { tokensOf } from "../src/scan.ts";
import { ruleFromShape, suggestShape, type SecretBody } from "../src/shape.ts";

const must = <T extends Element>(selector: string, ctor: new () => T): T => {
  const node = document.querySelector(selector);
  if (!(node instanceof ctor)) throw new Error(`missing ${selector}`);
  return node;
};

const whenInput = must("select#when", HTMLSelectElement);
const strictInput = must("input#strict", HTMLInputElement);
const reportInput = must("select#report", HTMLSelectElement);
const messageInput = must("input#message", HTMLInputElement);
const rulesList = must("#rules", HTMLUListElement);
const draft = must("#draft", HTMLTextAreaElement);
const tokens = must("#tokens", HTMLDivElement);
const verdict = must("#verdict", HTMLParagraphElement);
const sent = must("#sent", HTMLParagraphElement);
const shapeLabel = must("#shape-label", HTMLInputElement);
const shapePrefix = must("#shape-prefix", HTMLInputElement);
const shapeKeywords = must("#shape-keywords", HTMLInputElement);
const shapeBody = must("#shape-body", HTMLSelectElement);
const shapeMin = must("#shape-min", HTMLInputElement);
const shapeError = must("#shape-error", HTMLParagraphElement);
const binding = must("#binding", HTMLParagraphElement);
const build = must("#build", HTMLPreElement);

const builtins = new Set<SecretRule>(secretRules);
const rules: SecretRule[] = [...secretRules];
const enabled = new Set<SecretRule>(rules);
let shapeExample = "";

const readWhen = (value: string): DetectorWhen => {
  if (value === "onLiveChange" || value === "onChange") return value;
  throw new Error("unknown check event");
};

const readReport = (value: string): DetectorReport => {
  if (value === "detail" || value === "boolean") return value;
  throw new Error("unknown result mode");
};

const readBody = (value: string): SecretBody => {
  if (value === "letters-digits" || value === "digits" || value === "hex") {
    return value;
  }
  throw new Error("unknown body shape");
};

const readConfig = () => ({
  strict: strictInput.checked,
  when: readWhen(whenInput.value),
  report: readReport(reportInput.value),
  // A blank box means the default message, not an error while the field is being retyped.
  message: messageInput.value.trim() === "" ? undefined : messageInput.value,
  rules: rules.filter((rule) => enabled.has(rule)),
});

const detector = () => initializeSecretDetector(readConfig());

const checkDraft = () => {
  const text = draft.value;
  const result = detector().check(text);
  showResult(result);
  return result;
};

const showResult = (result: CheckResult) => {
  renderTokens(result);
  sent.hidden = true;
  verdict.dataset.pass = String(result.pass);
  if (result.pass) {
    verdict.textContent = "Pass. Send allowed.";
    return;
  }
  const sendLine = result.allowSend ? "Send allowed." : "Send refused.";
  if (result.report === "boolean") {
    verdict.textContent = `Secret detected. ${sendLine}`;
    return;
  }
  verdict.textContent = `${result.error.message} ${sendLine}`;
};

const renderTokens = (result: CheckResult | null) => {
  const matches =
    result && !result.pass && result.report === "detail" ? result.error.matches : [];
  tokens.replaceChildren();
  for (const token of tokensOf(draft.value)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "token";
    button.textContent = token.text;
    const match = matches.find((item) => item.start < token.end && item.end > token.start);
    if (match) {
      button.dataset.secret = "true";
      button.textContent = `${token.text} (${match.label})`;
    }
    button.addEventListener("click", () => useToken(token.text));
    tokens.append(button);
  }
};

const useToken = (token: string) => {
  shapeExample = token;
  shapeError.textContent = "";
  try {
    const shape = suggestShape(token);
    shapePrefix.value = shape.prefix;
    shapeBody.value = shape.body;
    shapeMin.value = String(shape.minLength);
    if (shape.prefix.length === 0) {
      shapeError.textContent =
        "No stable prefix found. Add a keyword that appears near this key.";
    }
  } catch (error) {
    shapeError.textContent =
      error instanceof Error ? error.message : "Could not read that token.";
  }
};

const renderRules = () => {
  rulesList.replaceChildren();
  for (const [index, rule] of rules.entries()) {
    const item = document.createElement("li");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = enabled.has(rule);
    box.dataset.index = String(index);
    const name = document.createElement("span");
    name.textContent = ` ${rule.label}`;
    const label = document.createElement("label");
    label.append(box, name);
    item.append(label);
    if (!builtins.has(rule)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.dataset.index = String(index);
      item.append(remove);
    }
    rulesList.append(item);
  }
};

const renderBuild = () => {
  const config = readConfig();
  binding.textContent = `Call detector.attach(field). It checks on ${config.when === "onLiveChange" ? "every edit" : "change"} and on Enter.`;
  build.textContent = JSON.stringify(config, null, 2);
};

// The sentence box uses the same attach call an app would. Re-attach when the config changes.
let detach = () => {};

const refresh = () => {
  renderBuild();
  detach();
  detach = detector().attach(draft, showResult);
  if (draft.value.length > 0) checkDraft();
  else renderTokens(null);
};

rulesList.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const rule = rules[Number(target.dataset.index)];
  if (!rule) return;
  if (target.checked) enabled.add(rule);
  else enabled.delete(rule);
  refresh();
});

rulesList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const index = Number(target.dataset.index);
  const rule = rules[index];
  if (!rule) return;
  enabled.delete(rule);
  rules.splice(index, 1);
  renderRules();
  refresh();
});

// With "onChange" the verdict waits for the change, so drop the old one while typing.
draft.addEventListener("input", () => {
  sent.hidden = true;
  if (readWhen(whenInput.value) === "onChange") renderTokens(null);
});

must("#check", HTMLButtonElement).addEventListener("click", () => {
  checkDraft();
});

must("#send", HTMLButtonElement).addEventListener("click", () => {
  const result = checkDraft();
  if (!result.allowSend) return;
  void fetch("/send", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: draft.value,
  })
    .then((response) => {
      sent.hidden = false;
      sent.textContent = response.ok ? "Sent." : "Send failed.";
    })
    .catch(() => {
      sent.hidden = false;
      sent.textContent = "Send failed.";
    });
});

must("#add-shape", HTMLButtonElement).addEventListener("click", () => {
  shapeError.textContent = "";
  try {
    const rule = ruleFromShape(
      {
        label: shapeLabel.value,
        prefix: shapePrefix.value,
        keywords: shapeKeywords.value.split(","),
        body: readBody(shapeBody.value),
        minLength: Number(shapeMin.value),
      },
      shapeExample.length > 0 ? shapeExample : undefined,
    );
    rules.unshift(rule);
    enabled.add(rule);
    renderRules();
    refresh();
  } catch (error) {
    shapeError.textContent =
      error instanceof Error ? error.message : "Could not add that shape.";
  }
});

for (const input of [whenInput, strictInput, reportInput]) {
  input.addEventListener("change", () => refresh());
}
messageInput.addEventListener("input", () => refresh());

must("#copy", HTMLButtonElement).addEventListener("click", () => {
  void navigator.clipboard.writeText(build.textContent).catch(() => {
    binding.textContent = "Copy failed. Select the config and copy it yourself.";
  });
});

must("#download", HTMLButtonElement).addEventListener("click", () => {
  const file = new Blob([build.textContent], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "secret-detector.config.json";
  link.click();
  URL.revokeObjectURL(url);
});

messageInput.value = initializeSecretDetector().config.message;
renderRules();
refresh();
