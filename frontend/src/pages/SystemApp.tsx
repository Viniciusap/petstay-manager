import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Tenant { slug: string; name: string; active: boolean; created_at: string }

async function systemFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/system/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json() as { data?: T; error?: string };
  if (!res.ok) throw new Error(body.error ?? 'Erro na requisição');
  return body.data as T;
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await systemFetch('/login', { method: 'POST', body: JSON.stringify({ senha }) });
      onLogin();
    } catch (err: any) {
      toast.error(err.message ?? 'Senha incorreta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">PetStay — System Admin</h1>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha</label>
          <input
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={loading || !senha}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded px-4 py-2 text-sm font-medium"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function CreateTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await systemFetch('/tenants', { method: 'POST', body: JSON.stringify({ slug, name }) });
      toast.success(`Tenant "${slug}" criado com sucesso`);
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao criar tenant');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Novo Tenant</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Slug (ex: hotel-joao)
          </label>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            minLength={2}
            maxLength={63}
            required
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nome do Hotel
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            minLength={2}
            required
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !slug || !name}
            className="px-4 py-2 text-sm rounded bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium"
          >
            {loading ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TenantDashboard() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: tenants = [], isLoading, error } = useQuery<Tenant[]>({
    queryKey: ['system-tenants'],
    queryFn: () => systemFetch<Tenant[]>('/tenants'),
    retry: false,
  });

  const toggleMut = useMutation({
    mutationFn: ({ slug, active }: { slug: string; active: boolean }) =>
      systemFetch(`/tenants/${slug}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-tenants'] }),
    onError: (err: any) => toast.error(err.message),
  });

  async function handleLogout() {
    await systemFetch('/logout', { method: 'POST' });
    window.location.reload();
  }

  if (isLoading) return <div className="p-8 text-gray-500">Carregando…</div>;
  if (error) return null; // will show login

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">PetStay — System Admin</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded"
          >
            + Novo Tenant
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-2 rounded border border-gray-200 dark:border-gray-700"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <table className="w-full bg-white dark:bg-gray-800 rounded-lg shadow text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Slug</th>
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Nome</th>
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Criado em</th>
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => (
              <tr key={t.slug} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                <td className="px-4 py-3 font-mono text-gray-900 dark:text-white">
                  <a
                    href={`/${t.slug}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:underline"
                  >
                    {t.slug}
                  </a>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{t.name}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {new Date(t.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    t.active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {t.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleMut.mutate({ slug: t.slug, active: !t.active })}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
                  >
                    {t.active ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nenhum tenant cadastrado. Crie o primeiro acima.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>

      {showCreate && (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['system-tenants'] })}
        />
      )}
    </div>
  );
}

export default function SystemApp() {
  const [authed, setAuthed] = useState<'loading' | 'yes' | 'no'>('loading');

  // Probe session on mount
  useEffect(() => {
    systemFetch<Tenant[]>('/tenants')
      .then(() => setAuthed('yes'))
      .catch(() => setAuthed('no'));
  }, []);

  if (authed === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-400">Verificando sessão…</div>
      </div>
    );
  }

  if (authed === 'no') {
    return <LoginForm onLogin={() => setAuthed('yes')} />;
  }

  return <TenantDashboard />;
}
