// app.json holds the static config (and the version); this adds what is
// derived from it or from the build's environment.
// - android.versionCode from the version (plugins/versionCode.js).
// - extra.distribution: "play" when HIVO_DISTRIBUTION=play (the AAB for
//   Google Play), else "direct" (the APK on the website). Play installs get
//   their updates from Play, so only "direct" builds check for a new APK.
//   expo-constants re-reads this file at every Gradle build, so one prebuild
//   serves both builds.
// - the release signing plugin (plugins/withReleaseSigning.js).
// - Play Store / Play services visibility for the QR scanner
//   (plugins/withPlayServicesVisibility.js).
const { versionCode } = require("./plugins/versionCode");

module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, versionCode: versionCode(config.version) },
  extra: { ...config.extra, distribution: process.env.HIVO_DISTRIBUTION === "play" ? "play" : "direct" },
  plugins: [...(config.plugins ?? []), "./plugins/withReleaseSigning", "./plugins/withPlayServicesVisibility"],
});
