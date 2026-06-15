import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';
import api, { ApiError } from '../lib/api';

type Mode = 'login' | 'first-setup';

const schema = z.object({
  senha: z.string().min(1, 'Digite sua senha'),
  setupToken: z.string().optional(),
});
type Fields = z.infer<typeof schema>;

const mfaSchema = z.object({ token: z.string().length(6, 'Código deve ter 6 dígitos') });
type MfaFields = z.infer<typeof mfaSchema>;

export function LoginPage() {
  const { login, completeMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
  const [mfaRequired, setMfaRequired] = useState(false);

  const { data: statusRes, isLoading: statusLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api.get<{ hasPassword: boolean; setupConfigured: boolean }>('/auth/status'),
    retry: false,
  });

  const s = statusRes?.data;
  const mode: Mode = !s || s.hasPassword ? 'login' : 'first-setup';

  const { register, handleSubmit, setError, formState: { errors } } = useForm<Fields>({
    resolver: zodResolver(schema),
    shouldUnregister: true,
  });

  const { mutate: doLogin, isPending, error: loginError } = useMutation({
    mutationFn: (d: Fields) => login(d.senha, d.setupToken),
    onSuccess: (result) => {
      if (result.mfa_required) { setMfaRequired(true); return; }
      navigate(from, { replace: true });
    },
  });

  const mfaForm = useForm<MfaFields>({ resolver: zodResolver(mfaSchema) });

  const { mutate: doMfa, isPending: mfaPending, error: mfaError } = useMutation({
    mutationFn: (d: MfaFields) => completeMfa(d.token),
    onSuccess: () => navigate(from, { replace: true }),
  });

  function onSubmit(d: Fields) {
    if (mode === 'first-setup' && s?.setupConfigured && !d.setupToken?.trim()) {
      setError('setupToken', { message: 'Digite o token de configuração' });
      return;
    }
    doLogin(d);
  }

  // MFA step
  if (mfaRequired) {
    const mfaErr = mfaError as ApiError | null;
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🔐</div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>Autenticação em 2 fatores</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Digite o código do seu aplicativo autenticador</p>
          </div>
          <form onSubmit={mfaForm.handleSubmit(d => doMfa(d))} className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <Input
              label="Código TOTP (6 dígitos)"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              autoFocus
              error={mfaForm.formState.errors.token?.message}
              {...mfaForm.register('token')}
            />
            {mfaErr && <p className="text-sm text-red-500">{mfaErr.code === 'INVALID_TOTP' ? 'Código inválido' : mfaErr.message}</p>}
            <Button type="submit" className="w-full" disabled={mfaPending}>
              {mfaPending ? 'Verificando...' : 'Confirmar'}
            </Button>
            <button type="button" className="w-full text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => setMfaRequired(false)}>
              ← Voltar ao login
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const err = loginError as ApiError | null;
  const errMsg = err?.code === 'INVALID_SETUP_TOKEN' ? 'Token de configuração inválido'
    : err?.code === 'INVALID_PASSWORD' ? 'Senha incorreta'
    : err?.code === 'PASSWORD_TOO_SHORT' ? 'Senha precisa ter ao menos 8 caracteres'
    : err ? err.message : '';

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🐾</div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
            PetStay Manager
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'first-setup' ? 'Primeira configuração' : 'Acesso administrativo'}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {mode === 'first-setup' && s?.setupConfigured && (
            <>
              <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                Primeira vez no sistema. Use o <strong>SETUP_TOKEN</strong> configurado no servidor para definir sua senha.
              </div>
              <Input
                label="Token de configuração (SETUP_TOKEN)"
                type="password"
                placeholder="Cole o valor de SETUP_TOKEN"
                autoFocus
                error={errors.setupToken?.message}
                {...register('setupToken')}
              />
            </>
          )}

          <Input
            label={mode === 'first-setup' ? 'Nova senha (mín. 8 caracteres)' : 'Senha'}
            type="password"
            placeholder="••••••••"
            autoFocus={mode === 'login'}
            error={errors.senha?.message}
            {...register('senha')}
          />

          {errMsg && <p className="text-sm text-red-500">{errMsg}</p>}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Entrando...' : mode === 'first-setup' ? 'Definir senha e entrar' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
