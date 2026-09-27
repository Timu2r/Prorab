import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, token, type User } from "./api";

type Auth = {
  user: User | null;
  loading: boolean;
  signIn: (t: string, u: User) => void;
  /** Ключ из ответа на заявку: «Мои заказы» появляются сразу, без входа по коду. */
  adopt: (t: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!token.get());

  const loadMe = useCallback(async () => {
    try {
      setUser((await api<{ user: User }>("GET", "/me")).user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) token.set(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token.get()) void loadMe();
  }, [loadMe]);

  const signIn = useCallback((t: string, u: User) => {
    token.set(t);
    setUser(u);
  }, []);

  const adopt = useCallback(
    async (t: string) => {
      token.set(t);
      setLoading(true);
      await loadMe();
    },
    [loadMe],
  );

  const signOut = useCallback(async () => {
    await api("POST", "/auth/logout").catch(() => {});
    token.set(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, signIn, adopt, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth вне AuthProvider");
  return a;
}

/** Клиент с заказами — вошёл по коду или по ключу браузера. Владельцу и мастерам — «Кабинет» и приложение. */
export function isStaff(u: User): boolean {
  return u.roles.includes("owner") || u.roles.includes("master");
}
