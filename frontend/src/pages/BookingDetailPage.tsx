import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { apiBase, resolveFileUrl, backendBase } from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import { useToast } from '../contexts/ToastContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import type { Booking, Contract, Settings, Animal, Tutor } from '../types';

// The GET /bookings/:id endpoint embeds animal, tutor, and contract
interface GaleriaItem { path: string; uploaded_at: string; }

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

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<null | { action: string; label: string; msg: string }>(null);
  const [acting, setActing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function load() {
    return Promise.all([
      api.get(`/bookings/${id}`),
      api.get('/settings'),
    ]).then(([bRes, sRes]: any[]) => {
      setBooking(bRes.data);
      setSettings(sRes.data);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  async function doAction(action: string) {
    setActing(true);
    try {
      if (action === 'checkin') await api.put(`/bookings/${id}/checkin`, {});
      else if (action === 'checkout') await api.put(`/bookings/${id}/checkout`, {});
      else if (action === 'pago') await api.put(`/bookings/${id}/pagamento`, { status_pagamento: 'pago' });
      else if (action === 'cancel') await api.delete(`/bookings/${id}`);
      toast('Atualizado com sucesso!');
      await load();
    } catch {
      toast('Erro ao realizar ação', 'error');
    } finally {
      setActing(false);
      setConfirm(null);
    }
  }

  async function uploadPhotos(files: FileList) {
    if (!files.length) return;
    setUploadingPhotos(true);
    try {
      const form = new FormData();
      Array.from(files).forEach(f => form.append('photos', f));
      await api.post(`/bookings/${id}/galeria`, form);
      toast('Fotos enviadas!');
      await load();
    } catch { toast('Erro ao enviar fotos', 'error'); }
    finally { setUploadingPhotos(false); }
  }

  async function removePhoto(index: number) {
    try {
      await api.delete(`/bookings/${id}/galeria/${index}`);
      toast('Foto removida');
      await load();
    } catch { toast('Erro ao remover foto', 'error'); }
  }

  function copyGaleriaLink() {
    if (!booking?.galeria_token) return;
    const url = `${window.location.origin}/galeria?t=${booking.galeria_token}`;
    navigator.clipboard.writeText(url).then(() => toast('Link da galeria copiado!'));
  }

  async function regenerateToken() {
    if (!booking?.contract) return;
    setRegenerating(true);
    try {
      await api.post(`/contracts/${booking.contract.id}/resend`, {});
      toast('Link regenerado!');
      await load();
    } catch {
      toast('Erro ao regenerar link', 'error');
    } finally {
      setRegenerating(false);
    }
  }

  function copyLink() {
    const contract = booking?.contract;
    if (!contract) return;
    const url = `${settings?.base_url}/assinar?t=${contract.token_unico}`;
    navigator.clipboard.writeText(url).then(() => toast(t('common.linkCopied')));
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

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
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
          <Avatar species={booking.animal?.especie} size="lg" />
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
                  <Button size="sm" variant="ghost" loading={regenerating} onClick={regenerateToken}>
                    {t('contract.regenerate')}
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <a href={`${apiBase}/contracts/${contract.id}/pdf/rascunho`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="ghost">📄 PDF Rascunho</Button>
              </a>
              {contractSigned && (
                <a href={`${apiBase}/contracts/${contract.id}/pdf/final`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="secondary">📄 PDF Final</Button>
                </a>
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
                    onClick={() => removePhoto(i)}
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
          onChange={e => e.target.files && uploadPhotos(e.target.files)}
        />
        <Button size="sm" variant="secondary" loading={uploadingPhotos} onClick={() => photoInputRef.current?.click()}>
          📷 {uploadingPhotos ? 'Enviando...' : 'Adicionar fotos'}
        </Button>

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
