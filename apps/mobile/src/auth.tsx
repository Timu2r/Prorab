import { primaryRole, type Role } from "@ks/core";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, TOKEN_KEY, type Me } from "./api";
import { storage } from "./storage";

const ROLE_KEY = "ks_role";

type Auth = {
  user: Me | null;
  /** Раздел, в котором человек сейчас работает: владелец, мастер или клиент. */
  role: Role | null;
  loading: boolean;
  /** Сервер недоступен при запуске — показываем «нет связи», а не экран входа. */
  offline: boolean;
  signIn: (token: string) => Promise<Me | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<Me | null>;
  setRole: (r: Role) => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [chosen, setChosen] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: Me }>("GET", "/me");
      setUser(user);
      setOffline(false);
      return user;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await storage.set(TOKEN_KEY, null);
        setUser(null);
      } else if (e instanceof ApiError && e.status === 0) setOffline(true);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setChosen((await storage.get(ROLE_KEY)) as Role | null);
        if (await storage.get(TOKEN_KEY)) await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const signIn = useCallback(
    async (token: string) => {
      await storage.set(TOKEN_KEY, token);
      return refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api("POST", "/auth/logout").catch(() => {});
    await storage.set(TOKEN_KEY, null);
    await storage.set(ROLE_KEY, null);
    setChosen(null);
    setUser(null);
  }, []);

  const setRole = useCallback(async (r: Role) => {
    await storage.set(ROLE_KEY, r);
    setChosen(r);
  }, []);

  const role = user ? (chosen && user.roles.includes(chosen) ? chosen : primaryRole(user.roles)) : null;

  return <Ctx.Provider value={{ user, role, loading, offline, signIn, signOut, refresh, setRole }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth вне AuthProvider");
  return a;
}
