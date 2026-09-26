import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, token, type User } from "./api";

type Auth = {
  user: User | null;
  loading: boolean;
  signIn: (t: string, u: User) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!token.get());

  useEffect(() => {
    if (!token.get()) return;
    api<{ user: User }>("GET", "/me")
      .then((r) => setUser(r.user))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) token.set(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback((t: string, u: User) => {
    token.set(t);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await api("POST", "/auth/logout").catch(() => {});
    token.set(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth вне AuthProvider");
  return a;
}
