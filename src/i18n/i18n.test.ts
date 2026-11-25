import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EN, EN_PLURAL, SAME_IN_ENGLISH } from "./en";

/** Every source file of the app (not the tests, not this folder, not the marketing site). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "landing" || name === "i18n" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const T_CALL = new RegExp(String.raw`(?<![\w.])t\(\s*${STR}`, "g");
const TN_CALL = new RegExp(String.raw`(?<![\w.])tn\([^"'` + "`" + String.raw`]*?,\s*${STR}\s*,\s*${STR}`, "g");
const unescape = (s: string) => JSON.parse(`"${s}"`) as string;

const keys = new Set<string>();
const plurals = new Set<string>();
for (const file of sources(join(__dirname, ".."))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(T_CALL)) keys.add(unescape(m[1]));
  for (const m of text.matchAll(TN_CALL)) plurals.add(unescape(m[1]));
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("English translations", () => {
  it("finds the texts in the code", () => {
    expect(keys.size).toBeGreaterThan(400);
    expect(plurals.size).toBeGreaterThan(5);
  });

  it("covers every t(…) text (or lists it as identical in English)", () => {
    const missing = [...keys].filter((k) => EN[k] === undefined && !SAME_IN_ENGLISH.includes(k));
    expect(missing, `texts without an English translation:\n${missing.join("\n")}`).toEqual([]);
  });

  it("covers every tn(…) text", () => {
    const missing = [...plurals].filter((k) => EN_PLURAL[k] === undefined);
    expect(missing, `plural texts without an English translation:\n${missing.join("\n")}`).toEqual([]);
  });

  it("keeps the {placeholders} of each text", () => {
    const bad = Object.entries(EN).filter(([it, en]) => placeholders(it).join() !== placeholders(en).join());
    expect(bad.map(([it]) => it)).toEqual([]);
    const badPlural = Object.entries(EN_PLURAL).filter(
      ([it, [one, many]]) => placeholders(it).join() !== placeholders(one).join() || placeholders(it).join() !== placeholders(many).join(),
    );
    expect(badPlural.map(([it]) => it)).toEqual([]);
  });

  it("has no entry for a text that is not in the code any more", () => {
    const unused = Object.keys(EN).filter((k) => !keys.has(k));
    expect(unused, `unused English entries:\n${unused.join("\n")}`).toEqual([]);
  });
});
