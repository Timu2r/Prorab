import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const t = useTheme();
  if (loading)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  return <Redirect href={user ? "/home" : "/login"} />;
}
