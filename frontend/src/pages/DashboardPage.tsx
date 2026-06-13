import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import type { Booking, Contract, Settings } from '../types';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmtBRL(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function presenceVariant(s: string) {
  if (s === 'check-in') return 'success';
  if (s === 'check-out') return 'neutral';
  if (s === 'cancelado') return 'error';
  return 'pending';
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [bRes, sRes] = await Promise.all([
        api.get<Booking[]>('/bookings'),
        api.get<Settings>('/settings'),
      ]);
      return { bookings: bRes.data ?? [], settings: sRes.data ?? null as Settings | null };
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const bookings = data?.bookings ?? [];
  const settings = data?.settings;
  const today = new Date().toISOString().slice(0, 10);

  const active = bookings.filter(b => b.status_presenca === 'check-in');
  const checkinsToday = bookings.filter(b => b.data_entrada === today && b.status_presenca === 'agendado');
  const checkoutsToday = bookings.filter(b => b.data_saida === today && b.status_presenca === 'check-in');
  const upcoming = bookings.filter(b => {
    const d = new Date(b.data_entrada);
    const now = new Date();
    const in7 = new Date(now); in7.setDate(now.getDate() + 7);
    return d > now && d <= in7 && b.status_presenca === 'agendado';
  });

  const kpis = [
    { label: t('dashboard.guests'), value: active.length, icon: '🐶' },
    { label: t('dashboard.checkins_today'), value: checkinsToday.length, icon: '📥' },
    { label: t('dashboard.checkouts_today'), value: checkoutsToday.length, icon: '📤' },
  ];

  function whatsappLink(b: Booking, contract: Contract | undefined) {
    if (!contract) return '#';
    const url = `${settings?.base_url}/assinar?t=${contract.token_unico}`;
    const text = encodeURIComponent(
      `Olá! 🐾\nO contrato de hospedagem de *${b.animal?.nome || ''}* está pronto para assinatura digital.\n\n📋 *Resumo:*\n• Check-in: ${fmtDate(b.data_entrada)}\n• Check-out: ${fmtDate(b.data_saida)}\n• Valor total: ${fmtBRL(b.valor_total)}\n\nAcesse o link para assinar:\n${url}\n\n— ${settings?.nome_estabelecimento || 'PetStay'}`
    );
    return `https://wa.me/${b.tutor?.telefone?.replace(/\D/g, '')}?text=${text}`;
  }

  function copyLink(b: Booking, contract: Contract | undefined) {
    if (!contract) return;
    const url = `${settings?.base_url}/assinar?t=${contract.token_unico}`;
    navigator.clipboard.writeText(url).then(() => toast.success(t('common.linkCopied')));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
        {settings?.nome_estabelecimento || t('dashboard.title')}
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="text-center">
            <p className="text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>{k.value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{k.label}</p>
          </Card>
        ))}
      </div>

      {/* Active guests */}
      <div>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{t('dashboard.active_guests')}</h2>
        {active.length === 0
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('dashboard.no_guests')}</p>
          : (
            <div className="grid sm:grid-cols-2 gap-3">
              {active.map(b => (
                <Card key={b.id} variant="bordered" className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/bookings/${b.id}`)}>
                  <div className="flex items-center gap-3">
                    <Avatar species={b.animal?.especie} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{b.animal?.nome || '—'}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{b.tutor?.nome || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Saída</p>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{fmtDate(b.data_saida)}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </div>

      {/* Today's agenda */}
      <div>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{t('dashboard.todays_agenda')}</h2>
        {checkinsToday.length === 0 && checkoutsToday.length === 0
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('dashboard.no_agenda')}</p>
          : (
            <div className="flex flex-col gap-2">
              {checkinsToday.map(b => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <span className="text-lg">📥</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{b.animal?.nome} — {b.tutor?.nome}</p>
                  </div>
                  <Badge variant="info">Check-in</Badge>
                </div>
              ))}
              {checkoutsToday.map(b => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <span className="text-lg">📤</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{b.animal?.nome} — {b.tutor?.nome}</p>
                  </div>
                  <Badge variant="warning">Check-out</Badge>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{t('dashboard.upcoming')}</h2>
          <div className="flex flex-col gap-2">
            {upcoming.slice(0, 5).map(b => (
              <div
                key={b.id}
                className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                onClick={() => navigate(`/bookings/${b.id}`)}
              >
                <Avatar species={b.animal?.especie} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.animal?.nome}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtDate(b.data_entrada)} → {fmtDate(b.data_saida)}</p>
                </div>
                <p className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--color-primary)' }}>{fmtBRL(b.valor_total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
