import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Engrave } from "../components/ui";
import { tr } from "../lib/i18n";
import { parsePairingUrl } from "../lib/pairing";
import { pair, sync } from "../store";
import { pairErrorText, T } from "../strings";
import { C, FONT, RADIUS } from "../theme";

export function PairScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);
  const t = tr(T);

  async function submit(input: string) {
    if (busy) return;
    const r = parsePairingUrl(input);
    if (!r.ok) {
      setError(pairErrorText(r.error));
      handled.current = false;
      return;
    }
    setBusy(true);
    setError(null);
    setScanning(false);
    try {
      await pair(r.pairing); // the app switches to the Library, which shows sync errors
      void sync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      handled.current = false;
    }
  }

  async function startScan() {
    setError(null);
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) {
        setError(t.cameraDenied);
        return;
      }
    }
    handled.current = false;
    setScanning(true);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Hivo</Text>
        <Text style={styles.title}>{t.pairTitle}</Text>
        <Text style={styles.body}>{t.pairIntro}</Text>

        {scanning ? (
          <View style={styles.cameraBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(res) => {
                if (handled.current) return;
                handled.current = true;
                void submit(res.data);
              }}
            />
          </View>
        ) : null}
        <Button
          label={scanning ? t.stopScan : permission && !permission.granted && !permission.canAskAgain ? t.allowCamera : t.scan}
          variant={scanning ? "secondary" : "primary"}
          onPress={() => (scanning ? setScanning(false) : void startScan())}
          style={{ marginTop: 20 }}
        />

        <Engrave style={{ marginTop: 28, marginBottom: 6 }}>{t.pasteLabel}</Engrave>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t.pastePlaceholder}
          placeholderTextColor={C.engrave}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={styles.input}
        />
        <Button label={busy ? t.pairing : t.pair} onPress={() => void submit(text)} disabled={busy || !text.trim()} style={{ marginTop: 10 }} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingTop: 32 },
  brand: { fontFamily: FONT.display, fontSize: 40, color: C.cream, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontFamily: FONT.display, fontSize: 24, color: C.cream, marginTop: 16, textTransform: "uppercase", letterSpacing: 0.5 },
  body: { color: C.body, fontSize: 15, lineHeight: 21, marginTop: 8 },
  cameraBox: { marginTop: 20, aspectRatio: 1, borderRadius: RADIUS, overflow: "hidden", borderWidth: 1, borderColor: C.ruleStrong, backgroundColor: C.panel },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: C.rule,
    backgroundColor: C.chassis,
    borderRadius: RADIUS,
    color: C.cream,
    padding: 10,
    fontFamily: FONT.mono,
    fontSize: 13,
    textAlignVertical: "top",
  },
  error: { color: C.missing, marginTop: 12, fontSize: 14 },
});
