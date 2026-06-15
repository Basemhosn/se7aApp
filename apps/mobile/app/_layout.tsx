import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Syne_700Bold,
  Syne_800ExtraBold,
} from "@expo-google-fonts/syne";
import {
  InstrumentSans_400Regular,
  InstrumentSans_600SemiBold,
} from "@expo-google-fonts/instrument-sans";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from "@expo-google-fonts/ibm-plex-mono";
import { AuthProvider } from "@/auth/AuthContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({
    Syne_700Bold,
    Syne_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0b0d0b" },
          animation: "slide_from_right",
        }}
      />
    </AuthProvider>
  );
}
