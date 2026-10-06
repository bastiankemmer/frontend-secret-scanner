import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecretField } from "./attach.ts";
import { initializeSecretDetector } from "./detector.ts";

// Built at run time so no key-shaped text sits in the repo.
const secret = `use sk-${"a".repeat(29)}1 now`;

class Field extends EventTarget {
  tagName: string;
  type?: string;
  value?: string;
  textContent?: string | null;
  isContentEditable?: boolean;
  constructor(tagName = "TEXTAREA") {
    super();
    this.tagName = tagName;
  }
}

const press = (field: Field, type: "keydown" | "keyup", init: object = {}) => {
  const view = window;
  const event = Object.assign(
    new Event(type, { cancelable: true }),
    { key: "Enter", composedPath: () => [field, view] },
    init,
  );
  view.dispatchEvent(event);
  if (!event.defaultPrevented) field.dispatchEvent(event);
  return event;
};

const textarea = (value: string) => Object.assign(new Field(), { value });

describe("attach", () => {
  beforeEach(() => {
    vi.stubGlobal("window", new EventTarget());
  });

  it("refuses anything that is not a text field", () => {
    const detector = initializeSecretDetector();
    expect(() => detector.attach(new Field("DIV") as SecretField)).toThrow(/text input/);
    expect(() => detector.attach(Object.assign(new Field("INPUT"), { type: "checkbox" }))).toThrow(
      /text input/,
    );
    expect(() => detector.attach({} as SecretField)).toThrow(/text input/);
  });

  it("checks on every edit with onLiveChange, on commit with onChange", () => {
    const live = vi.fn();
    const field = textarea(secret);
    initializeSecretDetector({ when: "onLiveChange" }).attach(field, live);
    field.dispatchEvent(new Event("change"));
    expect(live).not.toHaveBeenCalled();
    field.dispatchEvent(new Event("input"));
    expect(live).toHaveBeenCalledOnce();
    expect(live.mock.calls[0]?.[0].pass).toBe(false);

    const commit = vi.fn();
    const other = textarea("hello there");
    initializeSecretDetector({ when: "onChange" }).attach(other, commit);
    other.dispatchEvent(new Event("input"));
    other.dispatchEvent(new Event("focusout"));
    expect(commit).not.toHaveBeenCalled();
    other.dispatchEvent(new Event("change"));
    expect(commit.mock.calls[0]?.[0].pass).toBe(true);
  });

  it("checks a contenteditable on focusout by default, and on input with onLiveChange", () => {
    const commit = vi.fn();
    const editable = Object.assign(new Field("div"), { isContentEditable: true, textContent: secret });
    initializeSecretDetector().attach(editable, commit);
    editable.dispatchEvent(new Event("input"));
    editable.dispatchEvent(new Event("change"));
    expect(commit).not.toHaveBeenCalled();
    editable.dispatchEvent(new Event("focusout"));
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]?.[0].pass).toBe(false);

    const live = vi.fn();
    const liveField = Object.assign(new Field("div"), { isContentEditable: true, textContent: secret });
    initializeSecretDetector({ when: "onLiveChange" }).attach(liveField, live);
    liveField.dispatchEvent(new Event("focusout"));
    expect(live).not.toHaveBeenCalled();
    liveField.dispatchEvent(new Event("input"));
    expect(live).toHaveBeenCalledOnce();
    expect(live.mock.calls[0]?.[0].pass).toBe(false);
  });

  it("stops Enter before the app's handler when a secret is there (strict)", () => {
    const field = textarea(secret);
    initializeSecretDetector().attach(field);
    const send = vi.fn();
    field.addEventListener("keydown", send);
    const later = vi.fn();
    window.addEventListener("keydown", later, { capture: true });
    expect(press(field, "keydown").defaultPrevented).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    const keyup = vi.fn();
    field.addEventListener("keyup", keyup);
    expect(press(field, "keyup").defaultPrevented).toBe(true);
    expect(keyup).not.toHaveBeenCalled();
  });

  it("lets Enter through when the text is clean, and ignores other keys", () => {
    const send = vi.fn();
    const clean = textarea("hello there");
    initializeSecretDetector().attach(clean);
    clean.addEventListener("keydown", send);
    expect(press(clean, "keydown").defaultPrevented).toBe(false);
    expect(send).toHaveBeenCalledOnce();

    const field = textarea(secret);
    initializeSecretDetector().attach(field);
    field.addEventListener("keydown", send);
    expect(press(field, "keydown", { key: "a" }).defaultPrevented).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("blocks composing Enter and keyCode 229 only when the text has a secret", () => {
    for (const init of [{ isComposing: true }, { keyCode: 229, key: "Unidentified" }]) {
      const blocked = vi.fn();
      const dirty = textarea(secret);
      initializeSecretDetector().attach(dirty);
      dirty.addEventListener("keydown", blocked);
      expect(press(dirty, "keydown", init).defaultPrevented).toBe(true);
      expect(blocked).not.toHaveBeenCalled();

      const allowed = vi.fn();
      const clean = textarea("hello there");
      initializeSecretDetector().attach(clean);
      clean.addEventListener("keydown", allowed);
      expect(press(clean, "keydown", init).defaultPrevented).toBe(false);
      expect(allowed).toHaveBeenCalledOnce();
    }
  });

  it("does not block Shift+Enter when a secret is present", () => {
    const field = textarea(secret);
    initializeSecretDetector().attach(field);
    const send = vi.fn();
    field.addEventListener("keydown", send);
    const later = vi.fn();
    window.addEventListener("keydown", later, { capture: true });
    expect(press(field, "keydown", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(send).toHaveBeenCalledOnce();
    expect(later).toHaveBeenCalledOnce();
  });

  it("ignores Enter whose path misses the field", () => {
    const seen = vi.fn();
    const field = textarea(secret);
    initializeSecretDetector().attach(field, seen);
    const event = press(field, "keydown", { composedPath: () => [window] });
    expect(event.defaultPrevented).toBe(false);
    expect(seen).not.toHaveBeenCalled();
  });

  it("lets Enter through with strict off, but still reports", () => {
    const seen = vi.fn();
    const field = textarea(secret);
    initializeSecretDetector({ strict: false }).attach(field, seen);
    expect(press(field, "keydown").defaultPrevented).toBe(false);
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ pass: false, allowSend: true });
  });

  it("checks the text as it is at Enter, with no edit event first", () => {
    const field = textarea("fine");
    initializeSecretDetector({ when: "onChange" }).attach(field);
    field.value = secret;
    expect(press(field, "keydown").defaultPrevented).toBe(true);
  });

  it("reads contenteditable textContent, and an input's value over textContent", () => {
    const editable = Object.assign(new Field("div"), { isContentEditable: true, textContent: secret });
    initializeSecretDetector().attach(editable);
    expect(press(editable, "keydown").defaultPrevented).toBe(true);

    const input = Object.assign(new Field("input"), {
      type: "text",
      value: secret,
      textContent: "hello there",
    });
    initializeSecretDetector().attach(input);
    expect(press(input, "keydown").defaultPrevented).toBe(true);
  });

  it("accepts a lowercase tagName", () => {
    const field = Object.assign(new Field("textarea"), { value: secret });
    initializeSecretDetector().attach(field);
    expect(press(field, "keydown").defaultPrevented).toBe(true);
  });

  it("stops listening after the returned function is called", () => {
    const seen = vi.fn();
    const field = textarea(secret);
    const detach = initializeSecretDetector({ when: "onLiveChange" }).attach(field, seen);
    detach();
    field.dispatchEvent(new Event("input"));
    expect(seen).not.toHaveBeenCalled();
    expect(press(field, "keydown").defaultPrevented).toBe(false);
  });
});
