import { setUiLang, uiLang, type UiLang } from "@shared/lib/crewMessages";

// The website's language: /fr and /en force one, / follows the browser.
// Messages from the crew store (sign-in errors…) follow the same choice.

export type Lang = UiLang;

export function pageLang(path = typeof location === "undefined" ? "/" : location.pathname): Lang {
  if (/^\/fr(\/|$)/.test(path)) return "fr";
  if (/^\/en(\/|$)/.test(path)) return "en";
  return uiLang();
}

/** Call once at startup. */
export function applyPageLang(): Lang {
  const lang = pageLang();
  setUiLang(lang);
  document.documentElement.lang = lang;
  return lang;
}
