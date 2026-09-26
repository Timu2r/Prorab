import { CATEGORY_LABELS, STATUS_LABELS, type Category, type RequestStatus } from "@ks/core";
import { Text, View } from "react-native";
import { formatVisit } from "./format";
import { useTheme } from "./theme";
import { Card, Pill, statusTone } from "./ui";

/** Строка заявки в списках всех ролей: номер, направление, кто/где, статус, визит и сумма. */
export function RequestRow({
  number,
  category,
  status,
  line,
  visitAt,
  visitUntil,
  amount,
  onPress,
}: {
  number: string;
  category: Category;
  status: RequestStatus;
  line?: string;
  visitAt: string | null;
  visitUntil: string | null;
  amount?: string | null;
  onPress?: () => void;
}) {
  const t = useTheme();
  const visit = formatVisit(visitAt, visitUntil);
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: "800" }}>
            {number} <Text style={{ color: t.muted, fontWeight: "600" }}>· {CATEGORY_LABELS[category] ?? category}</Text>
          </Text>
          {line ? (
            <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>
              {line}
            </Text>
          ) : null}
        </View>
        <Pill text={STATUS_LABELS[status]} tone={statusTone(status)} />
      </View>
      {visit || amount ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ color: t.muted, fontSize: 14 }}>{visit ? `Визит ${visit}` : "Визит не назначен"}</Text>
          {amount ? <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>{amount}</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}
