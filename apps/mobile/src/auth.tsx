import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, tokenStore, type User } from "./api";

type Auth = {
  user: User | null;
  loading: boolean;
  signIn: (t: string, u: User) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!(await tokenStore.get())) return;
        setUser((await api<{ user: User }>("GET", "/me")).user);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await tokenStore.set(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (t: string, u: User) => {
    await tokenStore.set(t);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await api("POST", "/auth/logout").catch(() => {});
    await tokenStore.set(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth вне AuthProvider");
  return a;
}
