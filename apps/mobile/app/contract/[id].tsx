import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth";
import { ContractView } from "../../src/request/ContractView";
import { Splash } from "../../src/ui";

/** Договор заявки — для владельца и клиента. */
export default function ContractScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  return <ContractView id={id} />;
}
