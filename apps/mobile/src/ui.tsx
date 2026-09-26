import type { RequestStatus } from "@ks/core";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type Theme } from "./theme";

/** Общие элементы интерфейса. Стиль как у сайта; кнопки не меньше 48 px — мастера работают в перчатках. */

export type Tone = "neutral" | "accent" | "success" | "info" | "danger";

function tone(t: Theme, k: Tone) {
  if (k === "accent") return { bg: t.accentSoft, fg: t.accent };
  if (k === "success") return { bg: t.successSoft, fg: t.success };
  if (k === "info") return { bg: t.infoSoft, fg: t.info };
  if (k === "danger") return { bg: t.dangerSoft, fg: t.danger };
  return { bg: t.surface2, fg: t.muted };
}

export function statusTone(s: RequestStatus): Tone {
  if (s === "new") return "accent";
  if (s === "cancelled") return "danger";
  if (s === "paid" || s === "closed") return "success";
  if (s === "done" || s === "act_signed") return "info";
  return "neutral";
}

/** Экран с заголовком и прокруткой. На широком экране (браузер на ПК) содержимое по центру, не шире 760 px. */
export function Screen({
  title,
  subtitle,
  right,
  top,
  children,
  onRefresh,
  refreshing = false,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  top?: ReactNode;
  children?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} /> : undefined}
      >
        <View style={s.inner}>
          {top}
          <View style={s.header}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.title, { color: t.text }]}>{title}</Text>
              {subtitle ? <Text style={[s.subtitle, { color: t.muted }]}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[s.section, { color: t.text }]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Card({ children, onPress, style, dark }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; dark?: boolean }) {
  const t = useTheme();
  const look = [s.card, { backgroundColor: dark ? t.graphite : t.surface, borderColor: dark ? t.graphite : t.line }, style];
  if (!onPress) return <View style={look}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...look, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  icon: Icon,
  loading,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "ghost" | "danger";
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.accent : variant === "danger" ? t.dangerSoft : "transparent";
  const fg = variant === "primary" ? t.accentText : variant === "danger" ? t.danger : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: bg, borderColor: variant === "outline" ? t.line : "transparent", opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={18} color={fg} /> : null}
          <Text style={[s.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, error, hint, style, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.label, { color: t.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[s.input, { backgroundColor: t.surface, borderColor: error ? t.danger : t.line, color: t.text }, style]}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : hint ? <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({ text, tone: k = "neutral" }: { text: string; tone?: Tone }) {
  const t = useTheme();
  const c = tone(t, k);
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Переключатель вкладок внутри экрана: «Новые / В работе / Закрытые». */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.segment, { backgroundColor: on ? t.text : "transparent", borderColor: on ? t.text : t.line }]}
          >
            <Text style={[s.segmentText, { color: on ? t.bg : t.text }]}>
              {o.label}
              {o.count ? ` · ${o.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  const t = useTheme();
  return (
    <View style={[s.stat, { backgroundColor: t.surface, borderColor: t.line }]}>
      <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: accent ? t.accent : t.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 }}>{value}</Text>
      {hint ? <Text style={{ color: t.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  const t = useTheme();
  return (
    <View style={[s.empty, { borderColor: t.line }]}>
      <Icon size={30} color={t.muted} />
      <Text style={{ color: t.text, fontSize: 16, fontWeight: "700", textAlign: "center" }}>{title}</Text>
      {text ? <Text style={{ color: t.muted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>{text}</Text> : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ padding: 40, alignItems: "center" }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

/** Заставка на весь экран, пока загружается вход. */
export function Splash() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: t.bg }}>
      <Loading />
    </View>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <Card style={{ gap: 12, borderColor: t.dangerSoft }}>
      <Text style={{ color: t.danger, fontSize: 15 }}>{text}</Text>
      {onRetry ? <Button title="Повторить" variant="outline" small onPress={onRetry} /> : null}
    </Card>
  );
}

/** Строка «подпись — значение». */
export function KV({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: t.muted, fontSize: 15, flexShrink: 1 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: strong ? "800" : "600" }}>{value}</Text>
    </View>
  );
}

/** Подтверждение необратимого действия. В браузере — системное окно подтверждения. */
export function confirm(title: string, message: string, ok = "Да"): Promise<boolean> {
  if (Platform.OS === "web") {
    const c = (globalThis as { confirm?: (m: string) => boolean }).confirm;
    return Promise.resolve(c ? c(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Отмена", style: "cancel", onPress: () => resolve(false) },
        { text: ok, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  inner: { width: "100%", maxWidth: 760, alignSelf: "center", gap: 12 },
  header: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 4 },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  section: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  button: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonSmall: { minHeight: 42, paddingHorizontal: 14 },
  buttonText: { fontSize: 16, fontWeight: "700" },
  label: { fontSize: 14, fontWeight: "600" },
  input: { minHeight: 52, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 17 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  pillText: { fontSize: 13, fontWeight: "700" },
  segment: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  segmentText: { fontSize: 14, fontWeight: "700" },
  stat: { flexGrow: 1, flexBasis: 150, borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  empty: { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 28, alignItems: "center", gap: 8 },
});
