import { useFonts } from "expo-font";
import { getLocales } from "expo-localization";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, Linking, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { setLang } from "./src/lib/i18n";
import { parsePairingUrl } from "./src/lib/pairing";
import type { Kind } from "./src/lib/sync";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { NoteScreen } from "./src/screens/NoteScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { flush, getState, load, pair, sync, useApp } from "./src/store";
import { C } from "./src/theme";

setLang(getLocales()[0]?.languageCode);

/** A hivo://pair link opened from the system camera (or `simctl openurl`)
 * pairs right away, but only when no computer is paired yet. */
async function pairFromLink(url: string | null | undefined): Promise<void> {
  if (!url || getState().pairing) return;
  const r = parsePairingUrl(url);
  if (!r.ok) return;
  await pair(r.pairing);
  void sync();
}

type Route = { name: "library" } | { name: "note"; kind: Kind; id: string } | { name: "settings" };

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_600SemiBold: require("@expo-google-fonts/barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf"),
  });
  const loaded = useApp((s) => s.loaded);
  const paired = useApp((s) => s.pairing !== null);
  const [route, setRoute] = useState<Route>({ name: "library" });
  const [tab, setTab] = useState<Kind>("prod");

  useEffect(() => {
    void load().then(async () => {
      if (getState().pairing) void sync();
      else await pairFromLink(await Linking.getInitialURL());
    });
    const link = Linking.addEventListener("url", ({ url }) => {
      if (getState().loaded) void pairFromLink(url);
    });
    // Sync when the app comes back; save the cache when it leaves.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && getState().pairing) void sync();
      else if (s === "background" || s === "inactive") void flush();
    });
    return () => {
      sub.remove();
      link.remove();
    };
  }, []);

  useEffect(() => {
    if (!paired) setRoute({ name: "library" });
  }, [paired]);

  // Leaving a note pushes it right away (after the editor's unmount save).
  function goBack() {
    const fromNote = route.name === "note";
    setRoute({ name: "library" });
    if (fromNote) {
      setTimeout(() => {
        if (Object.keys(getState().sync.pending).length > 0) void sync();
      }, 50);
    }
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (route.name === "library") return false;
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [route]);

  const ready = loaded && (fontsLoaded || fontError);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.chassis }} edges={["top", "bottom", "left", "right"]}>
        <StatusBar style="light" />
        {!ready ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={C.hot} />
          </View>
        ) : !paired ? (
          <PairScreen />
        ) : route.name === "note" ? (
          <NoteScreen
            key={`${route.kind}:${route.id}`}
            kind={route.kind}
            id={route.id}
            onBack={goBack}
          />
        ) : route.name === "settings" ? (
          <SettingsScreen onBack={() => setRoute({ name: "library" })} />
        ) : (
          <LibraryScreen tab={tab} onTab={setTab} onOpen={(i) => setRoute({ name: "note", kind: i.kind, id: i.id })} onSettings={() => setRoute({ name: "settings" })} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
