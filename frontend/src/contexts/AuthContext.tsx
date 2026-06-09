import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
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
  login: (senha: string, setup_token?: string) => Promise<{ firstLogin: boolean; mfa_required: boolean }>;
  completeMfa: (token: string) => Promise<void>;
  logout: () => void;
}

interface MeResponse { authenticated: boolean; expiresAt?: string }
interface LoginResponse { expiresAt?: string; firstLogin?: boolean; mfa_required?: boolean }

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ isAuthenticated: false, expiresAt: null, loading: true });

  useEffect(() => {
    api.get<MeResponse>('/auth/me')
      .then(res => {
        const d = res.data;
        setState({
          isAuthenticated: !!d?.authenticated,
          expiresAt: d?.authenticated && d.expiresAt ? new Date(d.expiresAt) : null,
          loading: false,
        });
      })
      .catch(() => setState({ isAuthenticated: false, expiresAt: null, loading: false }));
  }, []);

  async function login(senha: string, setup_token?: string): Promise<{ firstLogin: boolean; mfa_required: boolean }> {
    const res = await api.post<LoginResponse>('/auth/login', { senha, ...(setup_token ? { setup_token } : {}) });
    const d = res.data!;
    if (d.mfa_required) {
      return { firstLogin: false, mfa_required: true };
    }
    setState({ isAuthenticated: true, expiresAt: new Date(d.expiresAt!), loading: false });
    return { firstLogin: d.firstLogin ?? false, mfa_required: false };
  }

  async function completeMfa(token: string): Promise<void> {
    const res = await api.post<LoginResponse>('/auth/mfa/validate', { token });
    const d = res.data!;
    setState({ isAuthenticated: true, expiresAt: new Date(d.expiresAt!), loading: false });
  }

  function logout() {
    setState(s => ({ ...s, isAuthenticated: false, expiresAt: null }));
    api.post('/auth/logout').catch(() => undefined);
  }

  return (
    <AuthContext.Provider value={{
      isAuthenticated: state.isAuthenticated,
      expiresAt: state.expiresAt,
      loading: state.loading,
      login,
      completeMfa,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
