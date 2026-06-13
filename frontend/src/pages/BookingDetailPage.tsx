import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { apiBase, resolveFileUrl } from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import type { Booking, Contract, Settings, Animal, Tutor } from '../types';

interface GaleriaItem { path: string; uploaded_at: string }
interface BookingDetail extends Omit<Booking, 'animal' | 'tutor' | 'contract'> {
  animal: Animal | null;
  tutor: Tutor | null;
  contract: Contract | null;
  galeria?: GaleriaItem[];
  galeria_token?: string;
}

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR'); }
function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

function contractBadge(s: string) {
  if (s === 'assinado') return <Badge variant="success">Assinado</Badge>;
  if (s === 'expirado') return <Badge variant="error">Expirado</Badge>;
  if (s === 'visualizado') return <Badge variant="info">Visualizado</Badge>;
  return <Badge variant="pending">Gerado</Badge>;
}

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<null | { action: string; label: string; msg: string }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: async () => {
      const [bRes, sRes] = await Promise.all([
        api.get<BookingDetail>(`/bookings/${id}`),
        api.get<Settings>('/settings'),
      ]);
      return { booking: bRes.data ?? null, settings: sRes.data ?? null };
    },
    staleTime: 0,
  });

  const booking = data?.booking ?? null;
  const settings = data?.settings ?? null;

  const { mutate: doAction, isPending: acting } = useMutation({
    mutationFn: async (action: string) => {
      if (action === 'checkin') return api.put(`/bookings/${id}/checkin`, {});
      if (action === 'checkout') return api.put(`/bookings/${id}/checkout`, {});
      if (action === 'pago') return api.put(`/bookings/${id}/pagamento`, { status_pagamento: 'pago' });
      if (action === 'cancel') return api.delete(`/bookings/${id}`);
      throw new Error(`Unknown action: ${action}`);
    },
    onSuccess: () => {
      toast.success('Atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
    },
    onError: () => toast.error('Erro ao realizar ação'),
    onSettled: () => setConfirm(null),
  });

  const { mutate: doRegenerate, isPending: regenerating } = useMutation({
    mutationFn: () => api.post(`/contracts/${booking?.contract?.id}/resend`, {}),
    onSuccess: () => {
      toast.success('Link regenerado!');
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
    },
    onError: () => toast.error('Erro ao regenerar link'),
  });

  const { mutate: doUploadPhotos, isPending: uploadingPhotos } = useMutation({
    mutationFn: (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach(f => form.append('photos', f));
      return api.post(`/bookings/${id}/galeria`, form);
    },
    onSuccess: () => {
      toast.success('Fotos enviadas!');
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
    },
    onError: () => toast.error('Erro ao enviar fotos'),
  });

  const { mutate: doRemovePhoto } = useMutation({
    mutationFn: (index: number) => api.delete(`/bookings/${id}/galeria/${index}`),
    onSuccess: () => {
      toast.success('Foto removida');
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
    },
    onError: () => toast.error('Erro ao remover foto'),
  });

  const { mutate: doIncluirFotoPerfil } = useMutation({
    mutationFn: async () => {
      const fotoPath = (booking?.animal as any)?.foto_path;
      const resp = await fetch(resolveFileUrl(fotoPath) ?? '');
      const blob = await resp.blob();
      const fd = new FormData();
      fd.append('photos', blob, 'foto_perfil.jpg');
      return api.post(`/bookings/${id}/galeria`, fd);
    },
    onSuccess: () => {
      toast.success('Foto de perfil incluída na galeria!');
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
    },
    onError: () => toast.error('Erro ao incluir foto'),
  });

  async function downloadPdf(url: string, filename: string) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao baixar PDF');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { toast.error('Erro ao baixar PDF'); }
  }

  function copyGaleriaLink() {
    if (!booking?.galeria_token) return;
    const url = `${window.location.origin}/galeria?t=${booking.galeria_token}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Link da galeria copiado!'));
  }

  function copyLink() {
    const contract = booking?.contract;
    if (!contract) return;
    const url = `${settings?.base_url}/assinar?t=${contract.token_unico}`;
    navigator.clipboard.writeText(url).then(() => toast.success(t('common.linkCopied')));
  }

  function whatsappLink() {
    const contract = booking?.contract;
    if (!contract || !booking) return '#';
    const url = `${settings?.base_url}/assinar?t=${contract.token_unico}`;
    const text = encodeURIComponent(
      `Olá! 🐾\nO contrato de hospedagem de *${booking.animal?.nome ?? ''}* está pronto para assinatura digital.\n\n📋 Resumo:\n• Entrada: ${fmtDate(booking.data_entrada)}\n• Saída: ${fmtDate(booking.data_saida)}\n• Total: ${fmtBRL(booking.valor_total)}\n\nLink: ${url}\n\n— ${settings?.nome_estabelecimento || 'PetStay'}`
    );
    return `https://wa.me/${booking.tutor?.telefone?.replace(/\D/g, '')}?text=${text}`;
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!booking) return <p style={{ color: 'var(--text-muted)' }}>Reserva não encontrada.</p>;

  const contract = booking.contract;
  const canCheckin = booking.status_presenca === 'agendado';
  const canCheckout = booking.status_presenca === 'check-in';
  const canPay = booking.status_pagamento !== 'pago';
  const canCancel = !['check-out', 'cancelado'].includes(booking.status_presenca);
  const contractSigned = contract?.status === 'assinado';

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate('/bookings')}>← {t('common.back')}</Button>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>Reserva</h1>
        {presenceBadge(booking.status_presenca)}
        {paymentBadge(booking.status_pagamento)}
      </div>

      {/* Animal + Tutor */}
      <Card>
        <div className="flex items-center gap-4">
          <Avatar species={booking.animal?.especie} size="lg" foto={(booking.animal as any)?.foto_path} />
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{booking.animal?.nome ?? '—'}</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{booking.animal?.especie} · {booking.animal?.raca}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>👤 {booking.tutor?.nome ?? '—'}</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>📞 {booking.tutor?.telefone ?? '—'}</p>
          </div>
        </div>
      </Card>

      {/* Booking details */}
      <Card>
        <div className="flex flex-col gap-3">
          <Row label="Check-in" value={fmtDate(booking.data_entrada)} />
          <Row label="Check-out" value={fmtDate(booking.data_saida)} />
          <Row label="Valor/diária" value={fmtBRL(booking.valor_diaria)} />
          {booking.servicos_adicionais?.map(s => <Row key={s.servico_id} label={s.nome} value={fmtBRL(s.valor)} />)}
          <div className="pt-2 border-t flex justify-between" style={{ borderColor: 'var(--border)' }}>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
            <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{fmtBRL(booking.valor_total)}</span>
          </div>
          {booking.observacoes && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>📝 {booking.observacoes}</p>}
        </div>
      </Card>

      {/* Contract */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('contract.title')}</p>
          {contract && contractBadge(contract.status)}
        </div>
        {contract && (
          <div className="flex flex-col gap-3">
            {!contractSigned && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={copyLink}>{t('common.copyLink')}</Button>
                <a href={whatsappLink()} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="secondary">📱 {t('common.sendWhatsapp')}</Button>
                </a>
                {contract.status !== 'assinado' && (
                  <Button size="sm" variant="ghost" loading={regenerating} onClick={() => doRegenerate()}>
                    {t('contract.regenerate')}
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => downloadPdf(`${apiBase}/contracts/${contract.id}/pdf/rascunho`, `contrato_${contract.id}_rascunho.pdf`)}>
                📄 PDF Rascunho
              </Button>
              {contractSigned && (
                <Button size="sm" variant="secondary" onClick={() => downloadPdf(`${apiBase}/contracts/${contract.id}/pdf/final`, `contrato_${contract.id}_final.pdf`)}>
                  📄 PDF Final
                </Button>
              )}
            </div>
            {contractSigned && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Assinado por: {contract.nome_digitado} · {contract.data_assinatura ? fmtDate(contract.data_assinatura) : ''}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Gallery */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>🐾 Galeria de Fotos</p>
          {booking.galeria_token && (
            <Button size="sm" variant="ghost" onClick={copyGaleriaLink}>🔗 Compartilhar</Button>
          )}
        </div>

        {booking.galeria?.length ? (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {booking.galeria.map((item, i) => {
              const url = resolveFileUrl(item.path);
              return (
                <div key={i} className="relative group aspect-square rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <img src={url ?? ''} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => doRemovePhoto(i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.6)' }}
                  >✕</button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Nenhuma foto ainda. Envie fotos do {booking.animal?.nome || 'pet'} durante a estadia!</p>
        )}

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => e.target.files && doUploadPhotos(e.target.files)}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={uploadingPhotos} onClick={() => photoInputRef.current?.click()}>
            📷 {uploadingPhotos ? 'Enviando...' : 'Adicionar fotos'}
          </Button>
          {(booking.animal as any)?.foto_path && (
            <Button size="sm" variant="ghost" onClick={() => doIncluirFotoPerfil()}>
              🐾 Incluir foto de perfil
            </Button>
          )}
        </div>

        {booking.galeria_token && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Link enviado ao tutor via "Compartilhar" · abre galeria pública sem login
          </p>
        )}
      </Card>

      {/* Actions */}
      <Card>
        <p className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Ações</p>
        <div className="flex flex-wrap gap-2">
          {canCheckin && <Button size="sm" onClick={() => setConfirm({ action: 'checkin', label: t('booking.actions.checkin'), msg: 'Confirmar check-in?' })}>📥 {t('booking.actions.checkin')}</Button>}
          {canCheckout && <Button size="sm" onClick={() => setConfirm({ action: 'checkout', label: t('booking.actions.checkout'), msg: 'Confirmar check-out?' })}>📤 {t('booking.actions.checkout')}</Button>}
          {canPay && <Button size="sm" variant="secondary" onClick={() => setConfirm({ action: 'pago', label: t('booking.actions.markPaid'), msg: 'Marcar reserva como paga?' })}>💰 {t('booking.actions.markPaid')}</Button>}
          {canCancel && <Button size="sm" variant="danger" onClick={() => setConfirm({ action: 'cancel', label: t('booking.actions.cancel'), msg: 'Cancelar esta reserva?' })}>✕ {t('booking.actions.cancel')}</Button>}
        </div>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.label || ''}
        message={confirm?.msg || ''}
        loading={acting}
        onConfirm={() => confirm && doAction(confirm.action)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
