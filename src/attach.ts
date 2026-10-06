/**
 * Wire a check to a text field. The field's text is checked when it changes
 * and when Enter is pressed. In strict mode, Enter with a secret in the text
 * is stopped before the app's own send handler sees it.
 */

/** A text input, a textarea, or a contenteditable element. */
export type SecretField = EventTarget & {
  tagName: string;
  type?: string;
  value?: string;
  textContent?: string | null;
  isContentEditable?: boolean;
};

const textInputTypes = new Set(["", "text", "search", "url", "email", "tel", "password"]);

const isTextField = (field: unknown): field is SecretField => {
  if (typeof field !== "object" || field === null) return false;
  const candidate = field as Partial<SecretField>;
  if (typeof candidate.addEventListener !== "function") return false;
  const name = candidate.tagName?.toUpperCase();
  if (name === "TEXTAREA") return true;
  if (name === "INPUT") return textInputTypes.has(candidate.type ?? "");
  return candidate.isContentEditable === true;
};

const textOf = (field: SecretField) => field.value ?? field.textContent ?? "";

// Enter is blocked on keydown and keyup, because apps send on either.
const enterEvents = ["keydown", "keyup"] as const;

type Checked = { allowSend: boolean };

export const attachToField = <Result extends Checked>(
  field: unknown,
  check: (text: string) => Result,
  changeEvent: "input" | "change",
  onResult: ((result: Result) => void) | undefined,
): (() => void) => {
  if (!isTextField(field)) {
    throw new Error("attach needs a text input, a textarea, or a contenteditable element.");
  }

  const onChange = () => {
    onResult?.(check(textOf(field)));
  };

  // keyCode 229 is Safari's IME Enter and often is not key "Enter".
  // isComposing does not skip the check. Shift+Enter is a newline, not a send.
  const onEnter = (event: Event) => {
    if (!event.composedPath().includes(field)) return;
    const key = event as KeyboardEvent;
    if (key.key === "Enter" && key.shiftKey) return;
    if (key.key !== "Enter" && key.keyCode !== 229) return;
    const result = check(textOf(field));
    if (event.type === "keydown") onResult?.(result);
    if (result.allowSend) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  // Contenteditable never fires change. focusout is the commit; input would be live.
  const watched = changeEvent === "change" && field.isContentEditable ? "focusout" : changeEvent;
  field.addEventListener(watched, onChange);
  // Options object, not a bare `true`: Node's removeEventListener ignores the boolean form.
  const onWindow = { capture: true };
  for (const type of enterEvents) window.addEventListener(type, onEnter, onWindow);

  return () => {
    field.removeEventListener(watched, onChange);
    for (const type of enterEvents) window.removeEventListener(type, onEnter, onWindow);
  };
};
