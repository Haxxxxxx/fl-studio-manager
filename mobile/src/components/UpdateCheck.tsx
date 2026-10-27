import { useState } from "react";
import { Linking, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { tr } from "../lib/i18n";
import { PLAY_URL, type ManualCheck } from "../lib/update";
import { T } from "../strings";
import { C } from "../theme";
import { checkForUpdateNow, checksForUpdates } from "../update";
import { Button } from "./ui";

/**
 * "Check for updates". Website builds ask the releases bucket and offer the
 * new APK; Play builds open the app's Play page (Play's policy: a Play app
 * never updates itself from elsewhere).
 */
export function UpdateCheck({ style }: { style?: ViewStyle }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ManualCheck | null>(null);
  const t = tr(T);

  if (!checksForUpdates()) {
    return (
      <View style={style}>
        <Button label={t.openPlay} onPress={() => void Linking.openURL(PLAY_URL)} />
      </View>
    );
  }

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await checkForUpdateNow());
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={style}>
      <Button label={busy ? t.checkingUpdates : t.checkUpdates} onPress={() => void check()} disabled={busy} />
      {result?.kind === "latest" ? <Text style={styles.text}>{t.upToDate(result.version)}</Text> : null}
      {result?.kind === "offline" ? <Text style={[styles.text, { color: C.missing }]}>{t.updateOffline}</Text> : null}
      {result?.kind === "update" ? (
        <>
          <Text style={styles.text}>{t.updateAvailable(result.update.version)}</Text>
          <Button
            label={t.updateDownload}
            variant="primary"
            onPress={() => void Linking.openURL(result.update.apk)}
            style={{ marginTop: 8 }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: C.body, fontSize: 14, lineHeight: 20, marginTop: 8 },
});
