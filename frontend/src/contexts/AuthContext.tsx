import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/api';

interface AuthState {
  isAuthenticated: boolean;
  expiresAt: Date | null;
  loading: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  expiresAt: Date | null;
  loading: boolean;
  login: (senha: string, setup_token?: string) => Promise<{ firstLogin: boolean }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ isAuthenticated: false, expiresAt: null, loading: true });

  useEffect(() => {
    api.get('/auth/me')
      .then((res: any) => {
        const { authenticated, expiresAt } = res.data;
        setState({ isAuthenticated: !!authenticated, expiresAt: authenticated ? new Date(expiresAt) : null, loading: false });
      })
      .catch(() => setState({ isAuthenticated: false, expiresAt: null, loading: false }));
  }, []);

  async function login(senha: string, setup_token?: string) {
    const res: any = await api.post('/auth/login', { senha, ...(setup_token ? { setup_token } : {}) });
    const { expiresAt, firstLogin } = res.data;
    setState({ isAuthenticated: true, expiresAt: new Date(expiresAt), loading: false });
    return { firstLogin };
  }

  function logout() {
    setState(s => ({ ...s, isAuthenticated: false, expiresAt: null }));
    api.post('/auth/logout').catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated: state.isAuthenticated, expiresAt: state.expiresAt, loading: state.loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
