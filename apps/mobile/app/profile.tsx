import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text } from "react-native";
import { ProfileScreen } from "../src/ProfileScreen";
import { useTheme } from "../src/theme";

/** Профиль владельца (открывается из вкладки «Ещё»). У мастера и клиента профиль — отдельная вкладка. */
export default function Profile() {
  const t = useTheme();
  return (
    <ProfileScreen
      top={
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={20} color={t.accent} />
          <Text style={{ color: t.accent, fontSize: 16, fontWeight: "700" }}>Назад</Text>
        </Pressable>
      }
    />
  );
}
