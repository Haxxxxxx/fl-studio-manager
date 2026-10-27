// Lets the pairing QR scanner (Google's code scanner, CameraView.launchScanner)
// work on Android 11+.
// - <queries> for the Play Store and Play services: expo-camera checks that
//   Google Play is installed with packageManager.getPackageInfo, which Android
//   11+ answers "not found" for packages the app doesn't declare, so the
//   scanner refused with "Google Play Services is not available" on phones
//   that have it (seen on a real phone, 2026-10-25).
// - com.google.mlkit.vision.DEPENDENCIES = barcode_ui: Play services fetches
//   the scanner module at install time instead of on the first scan.
// - an <intent> query for the camera app (STILL_IMAGE_CAMERA): when nothing
//   is read for a while, the pairing screen opens the phone's own camera
//   app (it reads the QR and opens the hivo:// link), and React Native's
//   Linking.sendIntent checks resolveActivity first, which Android 11+ also
//   filters.
const { withAndroidManifest } = require("expo/config-plugins");

const PACKAGES = ["com.android.vending", "com.google.android.gms"];
const INTENTS = ["android.media.action.STILL_IMAGE_CAMERA"];
const MLKIT_KEY = "com.google.mlkit.vision.DEPENDENCIES";

function addQueries(manifest) {
  const root = manifest.manifest;
  root.queries = root.queries ?? [{}];
  const q = root.queries[0];
  q.package = q.package ?? [];
  for (const name of PACKAGES) {
    if (!q.package.some((p) => p.$?.["android:name"] === name)) q.package.push({ $: { "android:name": name } });
  }
  q.intent = q.intent ?? [];
  for (const action of INTENTS) {
    const has = q.intent.some((i) => (i.action ?? []).some((a) => a.$?.["android:name"] === action));
    if (!has) q.intent.push({ action: [{ $: { "android:name": action } }] });
  }
  return manifest;
}

function addMlkitDependency(manifest) {
  const app = manifest.manifest.application?.[0];
  if (!app) return manifest;
  app["meta-data"] = app["meta-data"] ?? [];
  const existing = app["meta-data"].find((m) => m.$?.["android:name"] === MLKIT_KEY);
  if (existing) {
    const values = new Set(String(existing.$["android:value"] ?? "").split(",").filter(Boolean));
    values.add("barcode_ui");
    existing.$["android:value"] = [...values].join(",");
  } else {
    app["meta-data"].push({ $: { "android:name": MLKIT_KEY, "android:value": "barcode_ui" } });
  }
  return manifest;
}

const withPlayServicesVisibility = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = addMlkitDependency(addQueries(c.modResults));
    return c;
  });

module.exports = withPlayServicesVisibility;
module.exports.addQueries = addQueries;
module.exports.addMlkitDependency = addMlkitDependency;
