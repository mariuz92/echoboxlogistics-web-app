/**
 * Interface language of the app: Italian (the source language) and English.
 *
 * Every visible text in the code is written in Italian and wrapped in `t("…")`. Italian returns the
 * text as written; English looks it up in ./en.ts and falls back to the Italian when a text has no
 * translation (a unit test makes sure none is missing).
 *
 * The language is chosen once per page load, before anything is rendered:
 *   1. ?lang=it|en in the address (and remembered),
 *   2. the last choice, kept in this browser,
 *   3. Italian.
 * Changing it saves the choice and reloads the page, so texts defined at module level (menus, labels
 * of statuses…) are always in the right language and no component needs to subscribe to anything.
 * The browser's own language is deliberately NOT used: existing Italian companies must not see their
 * app switch to English because someone's browser is in English.
 */
import { EN, EN_PLURAL, SAME_IN_ENGLISH } from "./en";

const SAME = new Set(SAME_IN_ENGLISH);

export type AppLang = "it" | "en";
export const APP_LANGS: readonly AppLang[] = ["it", "en"];
export const APP_LANG_NAMES: Record<AppLang, string> = { it: "Italiano", en: "English" };

const STORAGE_KEY = "echobox-app-lang";
const isLang = (v: unknown): v is AppLang => v === "it" || v === "en";

function readStored(): AppLang | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null; // storage can be blocked
  }
}

function writeStored(lang: AppLang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* the choice then lasts for this page only */
  }
}

function detect(): AppLang {
  if (typeof window === "undefined") return "it";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (isLang(fromUrl)) {
      writeStored(fromUrl);
      return fromUrl;
    }
  } catch {
    /* ignore */
  }
  return readStored() ?? "it";
}

let current: AppLang = detect();
if (typeof document !== "undefined") document.documentElement.lang = current;

export const getLang = (): AppLang => current;

/** Saves the choice and reloads, so every text is rebuilt in the new language. */
export function setLang(lang: AppLang) {
  if (lang === current) return;
  writeStored(lang);
  // Drop ?lang= so the address does not undo the choice.
  const url = new URL(window.location.href);
  url.searchParams.delete("lang");
  window.location.assign(url);
}

const missing = new Set<string>();

function interpolate(text: string, vars?: Record<string, string | number>): string {
  return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : text;
}

/** A text in the current language. `{name}` placeholders are filled from `vars`. */
export function t(italian: string, vars?: Record<string, string | number>): string {
  if (current === "it") return interpolate(italian, vars);
  const english = EN[italian];
  if (english === undefined) {
    if (import.meta.env?.DEV && !SAME.has(italian) && !missing.has(italian)) {
      missing.add(italian);
      console.warn(`[i18n] no English text for: ${italian}`);
    }
    return interpolate(italian, vars);
  }
  return interpolate(english, vars);
}

/**
 * A text that depends on a count: `tn(n, "{n} ordine", "{n} ordini")`. `{n}` is filled in.
 * Italian uses the singular for exactly 1; English entries are in EN_PLURAL, keyed by the Italian singular.
 */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const all = { n, ...vars };
  if (current === "it") return interpolate(n === 1 ? one : other, all);
  const pair = EN_PLURAL[one];
  if (!pair) return interpolate(n === 1 ? one : other, all);
  return interpolate(n === 1 ? pair[0] : pair[1], all);
}

/** Locale tags for number, date and currency formatting. */
export const numberLocale = (): string => (current === "en" ? "en-GB" : "it-IT");
