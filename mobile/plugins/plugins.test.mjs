import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { versionCode } = require("./versionCode.js");
const { applyReleaseSigning } = require("./withReleaseSigning.js");
const appConfig = require("../app.config.js");
const appJson = require("../app.json");

// The shape `expo prebuild` generates (SDK 58), trimmed.
const GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`;

describe("versionCode", () => {
  it("is major*10000 + minor*100 + patch", () => {
    expect(versionCode("0.6.0")).toBe(600);
    expect(versionCode("0.6.1")).toBe(601);
    expect(versionCode("1.2.3")).toBe(10203);
    expect(versionCode("0.10.0")).toBeGreaterThan(versionCode("0.9.99"));
  });
  it("refuses what it can't encode", () => {
    expect(() => versionCode("0.6")).toThrow();
    expect(() => versionCode("0.6.0-beta")).toThrow();
    expect(() => versionCode("0.100.0")).toThrow();
    expect(() => versionCode("0.0.0")).toThrow();
  });
});

describe("app.config.js", () => {
  const base = { config: appJson.expo };
  it("derives the versionCode from app.json's version", () => {
    const c = appConfig(base);
    expect(c.version).toBe(appJson.expo.version);
    expect(c.android.versionCode).toBe(versionCode(appJson.expo.version));
    expect(c.android.package).toBe("fr.hivo.mobile");
    expect(c.plugins).toContain("./plugins/withReleaseSigning");
  });
  it("marks Play builds by HIVO_DISTRIBUTION", () => {
    const prev = process.env.HIVO_DISTRIBUTION;
    try {
      delete process.env.HIVO_DISTRIBUTION;
      expect(appConfig(base).extra.distribution).toBe("direct");
      process.env.HIVO_DISTRIBUTION = "play";
      expect(appConfig(base).extra.distribution).toBe("play");
    } finally {
      if (prev === undefined) delete process.env.HIVO_DISTRIBUTION;
      else process.env.HIVO_DISTRIBUTION = prev;
    }
  });
});

describe("withReleaseSigning", () => {
  it("adds a release signing config read from the environment", () => {
    const out = applyReleaseSigning(GRADLE);
    expect(out).toMatch(/debug \{[^}]*\}\s*release \{ \/\/ hivo-release-signing/);
    expect(out).toContain("System.getenv('HIVO_UPLOAD_STORE_FILE')");
    expect(out).toContain("signingConfig(System.getenv('HIVO_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug)");
    // The debug build type keeps the debug key.
    expect(out).toMatch(/debug \{\s*signingConfig signingConfigs\.debug\s*\}/);
    // No secret or path in the generated file.
    expect(out).not.toMatch(/\.jks/);
  });
  it("is idempotent", () => {
    const once = applyReleaseSigning(GRADLE);
    expect(applyReleaseSigning(once)).toBe(once);
  });
  it("fails loudly when the template changes", () => {
    expect(() => applyReleaseSigning("android { }")).toThrow(/signingConfigs/);
  });
});
