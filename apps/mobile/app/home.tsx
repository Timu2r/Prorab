import { formatPhone, primaryRole, ROLE_LABELS, STATUS_LABELS, type RequestStatus } from "@ks/core";
import { router } from "expo-router";
import { LogOut } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";

type RequestItem = { id: string; number: string; status: RequestStatus; district: string };

export default function Home() {
  const t = useTheme();
  const { user, signOut } = useAuth();
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ requests: RequestItem[] }>("GET", "/requests")).requests);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (!user) router.replace("/login");
    else void load();
  }, [user, load]);

  if (!user) return null;
  const role = primaryRole(user.roles);
  const s = styles(t);
  const title = role === "master" ? "Мои задания" : role === "owner" ? "Заявки" : "Мои заявки";

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <View style={s.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.name}>{user.name || formatPhone(user.phone)}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={s.pill}>
              <Text style={s.pillText}>{ROLE_LABELS[role]}</Text>
            </View>
            <Text style={s.muted}>{formatPhone(user.phone)}</Text>
          </View>
        </View>
        <Pressable onPress={() => void signOut()} hitSlop={10} accessibilityLabel="Выйти">
          <LogOut size={22} color={t.muted} />
        </Pressable>
      </View>

      <Text style={s.section}>{title}</Text>
      <FlatList
        data={items ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={<Text style={[s.muted, { paddingHorizontal: 4 }]}>{items === null ? "Загрузка…" : "Пока пусто"}</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.number}>{item.number}</Text>
              {!!item.district && <Text style={s.muted}>{item.district}</Text>}
            </View>
            <View style={s.pill}>
              <Text style={s.pillText}>{STATUS_LABELS[item.status]}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
    name: { fontSize: 24, fontWeight: "700", color: t.text },
    muted: { fontSize: 14, color: t.muted },
    pill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: t.accentSoft },
    pillText: { color: t.accent, fontSize: 13, fontWeight: "600" },
    section: { fontSize: 18, fontWeight: "600", color: t.text, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.surface,
    },
    number: { fontSize: 16, fontWeight: "600", color: t.text },
  });
