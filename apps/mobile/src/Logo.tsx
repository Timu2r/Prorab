import { BRAND } from "@ks/core";
import { Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useTheme } from "./theme";

/** Знак «Отвеса» — нить и груз, как на сайте. */
export function Logo({ size = 36 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Rect width={32} height={32} rx={4} fill={t.accent} />
        <Path d="M16 5v8" stroke="#fff" strokeWidth={2} />
        <Path d="M11 13h10l-5 13z" fill="#fff" />
      </Svg>
      <View>
        <Text style={{ color: t.text, fontSize: size * 0.6, fontWeight: "800", letterSpacing: -0.5 }}>{BRAND.name}</Text>
        <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{BRAND.tagline}</Text>
      </View>
    </View>
  );
}
