import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Drawer from '../components/ui/Drawer';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import type { Booking, BlockedDate } from '../types';

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function toYYYYMM(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function toYYYYMMDD(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface CalendarData { bookings: Booking[]; blocked: BlockedDate[] }

export function CalendarPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [drawerDay, setDrawerDay] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => api.get<CalendarData>(`/bookings/calendar?mes=${toYYYYMM(year, month)}`).then(r => r.data ?? { bookings: [], blocked: [] }),
  });

  const bookings = data?.bookings ?? [];
  const blocked = data?.blocked ?? [];

  const { mutate: blockDay, isPending: blocking } = useMutation({
    mutationFn: () => api.post('/dates/blocked', { data: drawerDay, motivo: blockReason }),
    onSuccess: () => {
      toast.success('Dia bloqueado!');
      setBlockReason('');
      queryClient.invalidateQueries({ queryKey: ['calendar', year, month] });
    },
    onError: () => toast.error('Erro'),
  });

  const { mutate: unblockDay } = useMutation({
    mutationFn: () => {
      const entry = blocked.find(b => b.data === drawerDay);
      if (!entry) throw new Error('Not found');
      return api.delete(`/dates/blocked/${entry.id}`);
    },
    onSuccess: () => {
      toast.success('Desbloqueado!');
      setDrawerDay(null);
      queryClient.invalidateQueries({ queryKey: ['calendar', year, month] });
    },
    onError: () => toast.error('Erro'),
  });

  function prev() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function bookingsForDay(day: number) {
    const d = toYYYYMMDD(year, month, day);
    return bookings.filter(b => b.data_entrada <= d && b.data_saida >= d);
  }

  function isBlocked(day: number) {
    const d = toYYYYMMDD(year, month, day);
    return blocked.find(b => b.data === d);
  }

  function dayColor(day: number) {
    const bl = isBlocked(day);
    if (bl) return { bg: '#FEE2E2', color: '#991B1B' };
    const bks = bookingsForDay(day);
    if (bks.length === 0) return { bg: 'transparent', color: 'var(--text-primary)' };
    if (bks.length >= 5) return { bg: '#D1FAE5', color: '#065F46' };
    return { bg: '#FEF3C7', color: '#92400E' };
  }

  const dayBookings = drawerDay ? bookings.filter(b => b.data_entrada <= drawerDay && b.data_saida >= drawerDay) : [];
  const dayBlockedEntry = drawerDay ? blocked.find(b => b.data === drawerDay) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('calendar.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={prev}>‹</Button>
          <span className="text-sm font-semibold min-w-32 text-center" style={{ color: 'var(--text-primary)' }}>{MONTHS_PT[month]} {year}</span>
          <Button variant="ghost" size="sm" onClick={next}>›</Button>
        </div>
      </div>

      <div className="flex gap-4 text-xs flex-wrap">
        {[
          { bg: 'transparent', color: 'var(--text-primary)', label: t('calendar.available') },
          { bg: '#FEF3C7', color: '#92400E', label: t('calendar.partial') },
          { bg: '#D1FAE5', color: '#065F46', label: t('calendar.full') },
          { bg: '#FEE2E2', color: '#991B1B', label: t('calendar.blocked') },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border" style={{ background: l.bg, borderColor: 'var(--border)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {isLoading
        ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : (
          <div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-xs font-medium py-1" style={{ color: 'var(--text-muted)' }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const { bg, color } = dayColor(day);
                const bks = bookingsForDay(day);
                return (
                  <button
                    key={day}
                    onClick={() => setDrawerDay(toYYYYMMDD(year, month, day))}
                    className="aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all hover:opacity-80 border"
                    style={{ background: bg, color, borderColor: 'var(--border)' }}
                  >
                    <span className="text-sm font-medium">{day}</span>
                    {bks.length > 0 && <span className="text-[10px] font-bold">{bks.length}🐾</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )
      }

      <Drawer open={!!drawerDay} onClose={() => setDrawerDay(null)} title={drawerDay || ''}>
        <div className="flex flex-col gap-4">
          {dayBlockedEntry
            ? (
              <div>
                <Badge variant="error">Bloqueado</Badge>
                {dayBlockedEntry.motivo && <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{dayBlockedEntry.motivo}</p>}
                <Button className="mt-3 w-full" variant="secondary" onClick={() => unblockDay()}>{t('calendar.unblock')}</Button>
              </div>
            )
            : (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('calendar.block_day')}</p>
                <Input placeholder={t('calendar.reason')} value={blockReason} onChange={e => setBlockReason(e.target.value)} />
                <Button loading={blocking} onClick={() => blockDay()} className="w-full">{t('calendar.block_day')}</Button>
              </div>
            )
          }

          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{t('calendar.bookings_day')}</p>
            {dayBookings.length === 0
              ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('calendar.no_bookings')}</p>
              : dayBookings.map(b => (
                <div key={b.id} className="flex items-center gap-2 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-lg">{b.status_presenca === 'check-in' ? '🐶' : '📋'}</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{(b as any).animal?.nome || b.animal_id}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{b.status_presenca}</p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </Drawer>
    </div>
  );
}
