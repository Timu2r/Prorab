import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth";
import { ClientRequest } from "../../src/request/ClientRequest";
import { MasterTask } from "../../src/request/MasterTask";
import { OwnerRequest } from "../../src/request/OwnerRequest";
import { Splash } from "../../src/ui";

/** Карточка заявки поверх вкладок: у владельца — управление, у мастера — задание, у клиента — смета и договор. */
export default function RequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, role, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (role === "owner") return <OwnerRequest id={id} />;
  if (role === "master") return <MasterTask id={id} />;
  return <ClientRequest id={id} />;
}
