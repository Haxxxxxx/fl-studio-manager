import { afterEach, describe, expect, it } from "vitest";
import { applyLang, dict, resolveLang, tr } from ".";
import { formatBytes, formatRelative, trashName } from "../lib/format";
import { STATUSES, UNSORTED, statusInfo } from "../lib/songs";

const DAY = 864e5;
afterEach(() => applyLang("en"));

describe("app language", () => {
  it("System follows the system; French and English are kept", () => {
    expect(resolveLang("fr")).toBe("fr");
    expect(resolveLang("en")).toBe("en");
    expect(["fr", "en"]).toContain(resolveLang("system"));
    expect(["fr", "en"]).toContain(resolveLang(undefined));
  });

  it("a dictionary gives the current language's words", () => {
    const T = dict({ hi: "Hi", n: (k: number) => `${k} songs` }, { hi: "Salut", n: (k: number) => `${k} sons` });
    applyLang("en");
    expect(tr(T).hi).toBe("Hi");
    applyLang("fr");
    expect(tr(T).hi).toBe("Salut");
    expect(tr(T).n(3)).toBe("3 sons");
  });

  it("stage names follow the language, read when shown", () => {
    applyLang("en");
    expect(STATUSES.map((s) => s.label)).toEqual(["Creation", "Production", "Prep", "Release", "Promotion"]);
    applyLang("fr");
    expect(STATUSES.map((s) => s.label)).toEqual(["Création", "Production", "Prépa", "Sortie", "Promo"]);
    expect(UNSORTED.label).toBe("Non classé");
    expect(statusInfo(undefined).label).toBe("Non classé");
    expect(statusInfo("prep").hint).toMatch(/Cover/);
  });

  it("dates, sizes and the trash in French", () => {
    applyLang("fr");
    const now = Date.now();
    expect(formatRelative(now)).toBe("aujourd'hui");
    expect(formatRelative(now - 3 * DAY)).toBe("il y a 3 jours");
    expect(formatRelative(now + DAY)).toBe("dans 1 jour");
    expect(formatRelative(now + 21 * DAY)).toBe("dans 3 semaines");
    expect(formatRelative(now - 90 * DAY)).toBe("il y a 3 mois");
    expect(formatBytes(1536)).toBe("1,5 Ko");
    expect(trashName()).toBe("Corbeille");
    applyLang("en");
    expect(formatRelative(now - 3 * DAY)).toBe("3 days ago");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});
