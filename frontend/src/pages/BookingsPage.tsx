import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import type { Booking } from '../types';

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR'); }
function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

function presenceBadge(s: string) {
  if (s === 'check-in') return <Badge variant="success">Check-in</Badge>;
  if (s === 'check-out') return <Badge variant="neutral">Check-out</Badge>;
  if (s === 'cancelado') return <Badge variant="error">Cancelado</Badge>;
  return <Badge variant="pending">Agendado</Badge>;
}

function paymentBadge(s: string) {
  if (s === 'pago') return <Badge variant="success">Pago</Badge>;
  if (s === 'parcial') return <Badge variant="warning">Parcial</Badge>;
  return <Badge variant="pending">Pendente</Badge>;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'check-in', label: 'Check-in' },
  { value: 'check-out', label: 'Check-out' },
  { value: 'cancelado', label: 'Cancelado' },
];

export function BookingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (statusFilter) params.set('status', statusFilter);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings', search, statusFilter],
    queryFn: () => api.get<Booking[]>(`/bookings?${params}`).then(r => r.data ?? []),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('booking.title')}</h1>
        <Button onClick={() => navigate('/bookings/new')}>{t('booking.new')}</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="w-44">
          <Select options={STATUS_OPTIONS} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} />
        </div>
      </div>

      {isLoading
        ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : bookings.length === 0
          ? <EmptyState emoji="📋" title={t('booking.noBookings')} action={{ label: t('booking.new'), onClick: () => navigate('/bookings/new') }} />
          : (
            <div className="flex flex-col gap-2">
              {bookings.map(b => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-4 rounded-2xl border cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                  onClick={() => navigate(`/bookings/${b.id}`)}
                >
                  <Avatar species={b.animal?.especie} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {b.animal?.nome || '—'}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {b.tutor?.nome || '—'} · {fmtDate(b.data_entrada)} → {fmtDate(b.data_saida)}
                    </p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{fmtBRL(b.valor_total)}</p>
                    <div className="flex gap-1">
                      {presenceBadge(b.status_presenca)}
                      {paymentBadge(b.status_pagamento)}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>›</span>
                </div>
              ))}
            </div>
          )
      }
    </div>
  );
}
