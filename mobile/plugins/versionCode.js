// Android versionCode from the app version: major*10000 + minor*100 + patch
// (0.6.0 → 600, 1.2.3 → 10203). Play refuses an upload whose versionCode
// isn't higher than the last one, so the version alone decides it.
// CommonJS: app.config.js loads it before any bundler runs.

/** @param {string} version "x.y.z" */
function versionCode(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!m) throw new Error(`app version must be x.y.z, got "${version}"`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`minor and patch must stay under 100 for the versionCode, got ${version}`);
  const code = major * 10000 + minor * 100 + patch;
  if (code < 1) throw new Error("versionCode must be at least 1");
  return code;
}

module.exports = { versionCode };
