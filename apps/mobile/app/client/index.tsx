import { BRAND, CATEGORY_LABELS, CATEGORY_WORKS, HEADLINE_SERVICES, priceFromText, type Category } from "@ks/core";
import { Phone } from "lucide-react-native";
import { Linking, Text, View } from "react-native";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import type { Service } from "../../src/types";
import { Button, Card, Screen, Section } from "../../src/ui";
import { useApi } from "../../src/useApi";

const DIRECTIONS = Object.keys(HEADLINE_SERVICES) as Exclude<Category, "general">[];

/** Главная клиента: связь с нами и направления с ценами «от». Новая заявка из приложения — этап E. */
export default function ClientHome() {
  const t = useTheme();
  const { user } = useAuth();
  const { data, refreshing, reload } = useApi<{ services: Service[] }>("/services");
  const price = (c: Exclude<Category, "general">) => {
    const s = data?.services.find((x) => x.id === `svc_${HEADLINE_SERVICES[c].key}`);
    return s?.price ? `${HEADLINE_SERVICES[c].label} ${priceFromText(s.price, s.unit)}` : "Цена по смете";
  };
  const phone = BRAND.phone;

  return (
    <Screen title={user?.name ? `Здравствуйте, ${user.name}` : "Здравствуйте"} subtitle={`${BRAND.name} — ремонт и строительные работы`} onRefresh={reload} refreshing={refreshing}>
      <Card dark style={{ gap: 12 }}>
        <Text style={{ color: t.graphiteText, fontSize: 20, fontWeight: "800" }}>Нужен ремонт или мастер?</Text>
        <Text style={{ color: t.graphiteMuted, fontSize: 15, lineHeight: 21 }}>
          Позвоните — уточним задачу и назовём стоимость. Работаем по договору, гарантия {BRAND.warrantyMonths} месяцев.
        </Text>
        {phone ? <Button title={phone} icon={Phone} onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`)} /> : null}
      </Card>
      <Section title="Что делаем">
        {DIRECTIONS.map((c) => (
          <Card key={c} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: "800", flexShrink: 1 }}>{CATEGORY_LABELS[c]}</Text>
            </View>
            <Text style={{ color: t.muted, fontSize: 14 }}>{CATEGORY_WORKS[c].join(" · ")}</Text>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>{price(c)}</Text>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
