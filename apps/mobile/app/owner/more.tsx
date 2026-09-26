import { router } from "expo-router";
import { ChevronRight, Settings, Tags, User, Users, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";
import { useTheme } from "../../src/theme";
import { Card, Screen } from "../../src/ui";

/** «Ещё»: прайс, клиенты, настройки (этап C) и профиль. */
export default function OwnerMore() {
  const t = useTheme();
  const Item = ({ icon: Icon, title, hint, onPress }: { icon: LucideIcon; title: string; hint?: string; onPress?: () => void }) => (
    <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 14, opacity: onPress ? 1 : 0.55 }}>
      <Icon size={22} color={onPress ? t.accent : t.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{title}</Text>
        {hint ? <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text> : null}
      </View>
      {onPress ? <ChevronRight size={20} color={t.muted} /> : null}
    </Card>
  );
  return (
    <Screen title="Ещё">
      <Item icon={Tags} title="Прайс" hint="Появится в следующем обновлении" />
      <Item icon={Users} title="Клиенты" hint="Появится в следующем обновлении" />
      <Item icon={Settings} title="Настройки" hint="Появится в следующем обновлении" />
      <Item icon={User} title="Профиль" hint="Имя, раздел, выход" onPress={() => router.push("/profile")} />
    </Screen>
  );
}
