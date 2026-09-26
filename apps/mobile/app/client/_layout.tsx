import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { House, ListChecks, User } from "lucide-react-native";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { Splash } from "../../src/ui";

/** Клиент: Главная, Мои заявки, Профиль (docs/TZ.md, 9.4). */
export default function ClientLayout() {
  const t = useTheme();
  const { user, role, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (role !== "client") return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Главная", tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="requests" options={{ title: "Мои заявки", tabBarIcon: ({ color, size }) => <ListChecks color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
