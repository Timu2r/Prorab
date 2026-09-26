import { BRAND, LOGO_COLORS, LOGO_MARK, LOGO_WORD } from "@ks/core";
import { Platform, Text, View } from "react-native";
import Svg, { Path, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "./theme";

/** В браузере у SVG-текста по умолчанию шрифт с засечками — задаём системный без засечек. */
const SANS = Platform.OS === "web" ? "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" : undefined;

/** Логотип: трафаретная надпись ПРОРАБ и подпись ровно по ширине слова (контуры — packages/core/src/logo.ts). */
export function Logo({ height = 30, tagline = true, inverse }: { height?: number; tagline?: boolean; inverse?: boolean }) {
  const t = useTheme();
  const ink = inverse ? t.graphiteText : t.text;
  const { width, letters } = LOGO_WORD;
  const vh = LOGO_WORD.height + (tagline ? 20 : 0);
  const scale = height / LOGO_WORD.height;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${BRAND.name}, ${BRAND.tagline}`}>
      <Svg width={width * scale} height={vh * scale} viewBox={`0 0 ${width} ${vh}`}>
        {letters.map((d, i) => (
          <Path key={i} d={d} fill={i === 0 ? t.accent : ink} />
        ))}
        {tagline ? (
          <SvgText x={0} y={LOGO_WORD.height + 19} textLength={width} lengthAdjust="spacing" fontSize={15.5} fontWeight="700" fontFamily={SANS} fill={inverse ? t.graphiteMuted : t.muted}>
            {BRAND.tagline.toUpperCase()}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

/** Знак: трафаретная П на графитовом квадрате — как иконка приложения. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${LOGO_MARK.size} ${LOGO_MARK.size}`}>
      <Rect width={LOGO_MARK.size} height={LOGO_MARK.size} rx={LOGO_MARK.radius} fill={LOGO_COLORS.graphite} />
      <Path d={LOGO_MARK.d} fill={LOGO_COLORS.orange} />
    </Svg>
  );
}

/** Тёмный блок с логотипом — верх экранов входа и знакомства. */
export function BrandCard({ note }: { note?: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.graphite, borderRadius: 16, padding: 22, gap: 14 }}>
      <Logo height={30} inverse />
      {note ? <Text style={{ color: t.graphiteMuted, fontSize: 14, lineHeight: 20 }}>{note}</Text> : null}
    </View>
  );
}
