import { describe, expect, it } from "vitest";
import { crewErrorMessage, crewText, currentUiLang, setUiLang, uiLang } from "./crewMessages";

// One test per dead end on the way into a crew (sign-up is closed).

describe("onboarding messages", () => {
  it("follows the system language", () => {
    expect(uiLang(["fr-FR", "en"])).toBe("fr");
    expect(uiLang(["en-GB", "fr"])).toBe("fr");
    expect(uiLang(["en-US"])).toBe("en");
    expect(uiLang([])).toBe("en");
  });

  it("unknown email: ask whoever runs Hivo to add you", () => {
    const err = { message: "Signups not allowed for otp", code: "otp_disabled" };
    expect(crewErrorMessage(err, "en")).toMatch(/isn't on your crew's list yet\. Ask whoever runs Hivo/);
    expect(crewErrorMessage(err, "fr")).toMatch(/n'est pas encore sur la liste de ton crew/);
  });

  it("wrong or expired sign-in code: ask for a new one", () => {
    expect(crewErrorMessage({ message: "Token has expired or is invalid" }, "en")).toBe("That code is wrong or expired. Ask for a new one.");
    expect(crewErrorMessage({ message: "Token has expired or is invalid" }, "fr")).toBe("Ce code est faux ou expiré. Demande un nouveau code.");
  });

  it("asking for a code again too soon: wait a few seconds (not 'after 0 seconds')", () => {
    const err = { message: "For security purposes, you can only request this after 0 seconds." };
    expect(crewErrorMessage(err, "en")).toMatch(/Wait a few seconds/);
    expect(crewErrorMessage(err, "fr")).toMatch(/Attends quelques secondes/);
  });

  it("signed in but no crew: enter your invite code", () => {
    expect(crewText("noCrew", "en", { email: "a@b.c" })).toMatch(/signed in as a@b\.c, but not in a crew yet\. Enter the invite code/);
    expect(crewText("noCrew", "fr", { email: "a@b.c" })).toMatch(/connecté en tant que a@b\.c.*Entre le code d'invitation/);
    expect(crewText("noInviteYet", "en")).toMatch(/Ask your crew's owner/);
  });

  it("invalid, revoked or used-up invite code: ask for a new one", () => {
    expect(crewText("invalidInvite", "en")).toMatch(/wrong, expired, used up or revoked.*Ask your crew for a new one/);
    expect(crewText("invalidInvite", "fr")).toMatch(/révoqué.*Demande un nouveau code/);
  });

  it("too many wrong invite codes, limits, offline", () => {
    expect(crewErrorMessage({ message: "too many tries, wait 10 minutes" }, "en")).toMatch(/Wait 10 minutes/);
    expect(crewErrorMessage({ message: "you already own 3 crews" }, "fr")).toMatch(/3 crews/);
    expect(crewErrorMessage({ message: "Failed to fetch" }, "en")).toMatch(/Are you online/);
    expect(crewErrorMessage({ message: "something else" }, "en")).toBe("something else");
  });

  it("the website can pin the language (/fr, /en) over the browser's", () => {
    setUiLang("fr");
    expect(currentUiLang()).toBe("fr");
    expect(crewText("badCode")).toBe("Ce code est faux ou expiré. Demande un nouveau code.");
    setUiLang("en");
    expect(crewText("badCode")).toBe("That code is wrong or expired. Ask for a new one.");
    setUiLang(null);
  });
});
