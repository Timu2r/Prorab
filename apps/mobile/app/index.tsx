import { Redirect } from "expo-router";
import { WifiOff } from "lucide-react-native";
import { View } from "react-native";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";
import { Button, Empty, Loading } from "../src/ui";

/** Развилка после запуска: вход → первый вход (имя и согласие) → раздел своей роли. */
export default function Index() {
  const { user, loading, offline, role, refresh } = useAuth();
  const t = useTheme();
  if (loading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: t.bg }}>
        <Loading />
      </View>
    );
  if (offline && !user)
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: t.bg }}>
        <Empty icon={WifiOff} title="Нет связи с сервером" text="Проверьте интернет и попробуйте ещё раз." />
        <Button title="Повторить" onPress={() => void refresh()} />
      </View>
    );
  if (!user) return <Redirect href="/login" />;
  if (!user.name || !user.consentAt) return <Redirect href="/welcome" />;
  return <Redirect href={`/${role}`} />;
}
