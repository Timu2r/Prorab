import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { ClipboardCheck, User, Users, Wallet } from "lucide-react-native";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { Splash } from "../../src/ui";

/** Мастер: Задания, Заработок, Профиль; у бригадира ещё Команда (docs/TZ.md, 9.3). */
export default function MasterLayout() {
  const t = useTheme();
  const { user, role, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (role !== "master") return <Redirect href="/" />;
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
      <Tabs.Screen name="index" options={{ title: "Задания", tabBarIcon: ({ color, size }) => <ClipboardCheck color={color} size={size} /> }} />
      <Tabs.Screen
        name="team"
        options={{ title: "Команда", href: user.isLead ? undefined : null, tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tabs.Screen name="earnings" options={{ title: "Заработок", tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
