import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, type ApiUser } from './api';

interface AuthCtx {
  user: ApiUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const persist = (token: string, u: ApiUser) => {
    setToken(token);
    setUser(u);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        login: async (email, password) => {
          const r = await api.login({ email, password });
          persist(r.token, r.user);
        },
        register: async (email, name, password) => {
          const r = await api.register({ email, name, password });
          persist(r.token, r.user);
        },
        logout: () => {
          setToken(null);
          setUser(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
export type { AuthCtx };
