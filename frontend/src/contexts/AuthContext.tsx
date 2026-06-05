import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/api';

interface AuthState {
  token: string | null;
  expiresAt: Date | null;
}

interface AuthContextType {
  token: string | null;
  expiresAt: Date | null;
  isAuthenticated: boolean;
  login: (senha: string, setup_token?: string) => Promise<{ firstLogin: boolean }>;
  logout: () => void;
}

const KEY = 'petstay_auth';

function load(): AuthState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { token: null, expiresAt: null };
    const { token, expiresAt } = JSON.parse(raw);
    const exp = new Date(expiresAt);
    if (exp <= new Date()) { localStorage.removeItem(KEY); return { token: null, expiresAt: null }; }
    return { token, expiresAt: exp };
  } catch { return { token: null, expiresAt: null }; }
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(load);

  useEffect(() => {
    const id = api.interceptors.request.use(cfg => {
      if (state.token) cfg.headers['Authorization'] = `Bearer ${state.token}`;
      return cfg;
    });
    return () => api.interceptors.request.eject(id);
  }, [state.token]);

  async function login(senha: string, setup_token?: string) {
    const res: any = await api.post('/auth/login', { senha, ...(setup_token ? { setup_token } : {}) });
    const { token, expiresAt, firstLogin } = res.data;
    localStorage.setItem(KEY, JSON.stringify({ token, expiresAt }));
    setState({ token, expiresAt: new Date(expiresAt) });
    return { firstLogin };
  }

  function logout() {
    api.post('/auth/logout').catch(() => {}); // revoke jti server-side (fire-and-forget)
    localStorage.removeItem(KEY);
    setState({ token: null, expiresAt: null });
  }

  const isAuthenticated = !!state.token && !!state.expiresAt && state.expiresAt > new Date();

  return (
    <AuthContext.Provider value={{ token: state.token, expiresAt: state.expiresAt, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
