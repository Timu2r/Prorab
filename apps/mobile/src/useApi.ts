import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { api, errorText } from "./api";

/** Данные экрана: загружаются при каждом открытии экрана, «потянуть вниз» — обновить. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (pull = false) => {
      if (!path) return;
      if (pull) setRefreshing(true);
      try {
        setData(await api<T>("GET", path));
        setError(null);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { data, error, loading, refreshing, reload: () => load(true) };
}
