import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { ClipboardList, Ellipsis, HardHat, LayoutDashboard, Wallet } from "lucide-react-native";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { Splash } from "../../src/ui";

/** Владелец: Сводка, Заявки, Мастера, Деньги, Ещё (docs/TZ.md, 9.2). */
export default function OwnerLayout() {
  const t = useTheme();
  const { user, role, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (role !== "owner") return <Redirect href="/" />;
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
      <Tabs.Screen name="index" options={{ title: "Сводка", tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="requests" options={{ title: "Заявки", tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="masters" options={{ title: "Мастера", tabBarIcon: ({ color, size }) => <HardHat color={color} size={size} /> }} />
      <Tabs.Screen name="money" options={{ title: "Деньги", tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }} />
      <Tabs.Screen name="more" options={{ title: "Ещё", tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} /> }} />
    </Tabs>
  );
}
