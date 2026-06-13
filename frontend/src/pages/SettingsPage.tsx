import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Modal from '../components/ui/Modal';
import { toast } from 'sonner';
import api, { resolveFileUrl } from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import { useTheme } from '../contexts/ThemeContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Card from '../components/ui/Card';
import FileUpload from '../components/ui/FileUpload';
import Spinner from '../components/ui/Spinner';
import Textarea from '../components/ui/Textarea';
import PhoneInput from '../components/ui/PhoneInput';
import SignatureCanvas, { SignatureCanvasHandle } from '../components/signing/SignatureCanvas';
import type { Settings } from '../types';

const pwSchema = z.object({
  senha_atual: z.string().optional(),
  senha_nova: z.string().min(8, 'Mínimo 8 caracteres'),
  confirma: z.string(),
}).refine(d => d.senha_nova === d.confirma, { message: 'Senhas não coincidem', path: ['confirma'] });
type PwFields = z.infer<typeof pwSchema>;

function PasswordSection() {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PwFields>({
    resolver: zodResolver(pwSchema),
  });

  const { mutate: changePassword, isPending: saving } = useMutation({
    mutationFn: (d: PwFields) => api.post('/settings/password', { senha_atual: d.senha_atual || undefined, senha_nova: d.senha_nova }),
    onSuccess: () => { toast.success('Senha alterada!'); reset(); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao alterar senha'),
  });

  return (
    <Card>
      <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Senha de acesso</p>
      <form onSubmit={handleSubmit(d => changePassword(d))} className="flex flex-col gap-3 max-w-sm">
        <Input label="Senha atual" type="password" placeholder="Deixe vazio se ainda não definiu" {...register('senha_atual')} />
        <Input label="Nova senha" type="password" error={errors.senha_nova?.message} {...register('senha_nova')} />
        <Input label="Confirmar nova senha" type="password" error={errors.confirma?.message} {...register('confirma')} />
        <Button type="submit" loading={saving} variant="secondary">Alterar senha</Button>
      </form>
    </Card>
  );
}

const PRESET_COLORS = ['#F97316', '#10B981', '#6366F1', '#EC4899', '#EF4444', '#F59E0B'];

interface Backup { fname: string; size: number; mtime: string }

interface HotelSigProps {
  preview: string;
  repName: string;
  sigRef: React.RefObject<SignatureCanvasHandle | null>;
  saving: boolean;
  onNameChange: (v: string) => void;
  onSave: () => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
}

function HotelSignatureCard({ preview, repName, sigRef, saving, onNameChange, onSave, onRemove, onUpload }: HotelSigProps) {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');

  return (
    <Card>
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Assinatura do Estabelecimento</p>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Configurada uma vez e aplicada automaticamente em todos os contratos gerados.
      </p>

      {preview ? (
        <div className="flex items-center gap-4">
          <img src={preview} alt="Assinatura do hotel" className="h-20 border rounded-xl object-contain bg-white px-2" style={{ borderColor: 'var(--border)', maxWidth: 220 }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{repName}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Representante do estabelecimento</p>
            <Button size="sm" variant="danger" className="mt-2" onClick={onRemove}>Remover</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input label="Nome do representante" placeholder="Nome completo" value={repName} onChange={e => onNameChange(e.target.value)} />

          <div className="flex gap-1 p-1 rounded-xl self-start" style={{ background: 'var(--bg-hover)' }}>
            {(['draw', 'upload'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: mode === m ? 'var(--bg-card)' : 'transparent',
                  color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {m === 'draw' ? '✍️ Desenhar' : '📁 Enviar imagem'}
              </button>
            ))}
          </div>

          {mode === 'draw' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Use o mouse ou o dedo para assinar</p>
                <button className="text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => sigRef.current?.clear()}>Limpar</button>
              </div>
              <SignatureCanvas ref={sigRef} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>PNG, JPG ou WebP com fundo branco · máx. 2MB</p>
              <FileUpload accept="image/png,image/jpeg,image/webp" maxMB={2} label="Arraste a imagem da assinatura ou clique aqui" onFile={onUpload} />
            </div>
          )}

          <Button loading={saving} onClick={onSave} className="self-start">Salvar Assinatura</Button>
        </div>
      )}
    </Card>
  );
}

function MfaSection() {
  const queryClient = useQueryClient();
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  const { data: mfaStatus } = useQuery({
    queryKey: ['mfa-status'],
    queryFn: () => api.get<{ mfa_enabled: boolean }>('/settings').then(r => ({ enabled: !!r.data?.mfa_enabled })),
  });

  const { mutate: setupMfa, isPending: settingUp } = useMutation({
    mutationFn: () => api.post<{ secret: string; qrDataUrl: string }>('/auth/mfa/setup'),
    onSuccess: (res) => {
      setQr(res.data?.qrDataUrl ?? '');
      setSecret(res.data?.secret ?? '');
      setShowSetup(true);
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao configurar MFA'),
  });

  const { mutate: verifyMfa, isPending: verifying } = useMutation({
    mutationFn: () => api.post('/auth/mfa/verify', { token: mfaCode }),
    onSuccess: () => {
      toast.success('MFA ativado com sucesso!');
      setShowSetup(false);
      setMfaCode('');
      queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      queryClient.invalidateQueries({ queryKey: ['settings-full'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Código inválido'),
  });

  const { mutate: disableMfa, isPending: disabling } = useMutation({
    mutationFn: () => api.delete('/auth/mfa'),
    onSuccess: () => {
      toast.success('MFA desativado');
      queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      queryClient.invalidateQueries({ queryKey: ['settings-full'] });
    },
    onError: () => toast.error('Erro ao desativar MFA'),
  });

  const enabled = mfaStatus?.enabled ?? false;

  return (
    <Card>
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Autenticação em 2 fatores (MFA)</p>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Proteja o acesso ao sistema com um código TOTP gerado por um aplicativo como Google Authenticator ou Authy.
      </p>

      {enabled ? (
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: '#10B981' }}>✅ MFA ativo</span>
          <Button size="sm" variant="danger" loading={disabling} onClick={() => disableMfa()}>Desativar MFA</Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" loading={settingUp} onClick={() => setupMfa()}>Configurar MFA</Button>
      )}

      <Modal
        open={showSetup}
        onClose={() => setShowSetup(false)}
        title="Configurar autenticação em 2 fatores"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowSetup(false)}>Cancelar</Button>
            <Button loading={verifying} disabled={mfaCode.length !== 6} onClick={() => verifyMfa()}>Ativar MFA</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Escaneie o QR code com seu aplicativo autenticador (Google Authenticator, Authy, etc.) e insira o código gerado para confirmar.
          </p>
          {qr && <img src={qr} alt="QR Code MFA" className="self-center rounded-xl border" style={{ width: 180, height: 180, borderColor: 'var(--border)' }} />}
          {secret && (
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Ou insira o código manualmente:</p>
              <code className="text-sm font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{secret}</code>
            </div>
          )}
          <Input
            label="Código de verificação (6 dígitos)"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={mfaCode}
            onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </Modal>
    </Card>
  );
}

export function SettingsPage() {
  const { t, lang, setLang } = useTranslation();
  const { setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [clausulas, setClausulas] = useState<string[]>([]);
  const [hotelSigPreview, setHotelSigPreview] = useState('');
  const [hotelRepName, setHotelRepName] = useState('');
  const hotelSigRef = useRef<SignatureCanvasHandle | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [form, setForm] = useState<Partial<Settings>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['settings-full'],
    queryFn: () => api.get<Settings>('/settings').then(r => r.data ?? null as Settings | null),
  });

  useEffect(() => {
    if (!data) return;
    setForm(data);
    const cl = lang === 'en' ? data.clausulas_en : data.clausulas_pt;
    setClausulas(cl || []);
    setHotelRepName(data.nome_hotel_assinante || '');
    if (data.assinatura_hotel_path) {
      const url = resolveFileUrl(data.assinatura_hotel_path);
      if (url) setHotelSigPreview(`${url}?t=${Date.now()}`);
    }
    if (data.logo_path) {
      const url = resolveFileUrl(data.logo_path);
      if (url) setLogoPreview(url);
    }
  }, [data]);

  const { data: backups = [] } = useQuery({
    queryKey: ['settings-backups'],
    queryFn: () => api.get<Backup[]>('/settings/backup/list').then(r => r.data ?? []),
    retry: false,
  });

  const { mutate: saveSettings, isPending: saving } = useMutation({
    mutationFn: () => {
      const clausulasKey = lang === 'en' ? 'clausulas_en' : 'clausulas_pt';
      return api.put('/settings', { ...form, [clausulasKey]: clausulas });
    },
    onSuccess: () => {
      setLang((form.idioma_padrao as 'pt' | 'en') || 'pt');
      setTheme((form.tema_padrao as 'light' | 'dark') || 'light');
      toast.success(t('settings.saved'));
      queryClient.invalidateQueries({ queryKey: ['settings-full'] });
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const { mutate: uploadLogo, isPending: uploadingLogo } = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('logo', file);
      return api.post('/settings/logo', fd);
    },
    onSuccess: (_, file) => {
      setLogoPreview(URL.createObjectURL(file));
      toast.success('Logo atualizado!');
    },
    onError: () => toast.error('Erro no upload'),
  });

  const { mutate: removeLogo } = useMutation({
    mutationFn: () => api.delete('/settings/logo'),
    onSuccess: () => { setLogoPreview(''); queryClient.invalidateQueries({ queryKey: ['settings-full'] }); },
  });

  const { mutate: saveHotelSig, isPending: savingSig } = useMutation({
    mutationFn: async () => {
      if (hotelSigRef.current?.isEmpty()) throw new Error('canvas-empty');
      if (!hotelRepName.trim()) throw new Error('no-rep-name');
      const sig = hotelSigRef.current!.toDataURL();
      return api.post('/settings/assinatura', { assinatura_base64: sig, nome_representante: hotelRepName.trim() });
    },
    onSuccess: (_, __, ___) => {
      const sig = hotelSigRef.current!.toDataURL();
      setHotelSigPreview(sig);
      toast.success('Assinatura salva!');
    },
    onError: (e: any) => {
      if (e?.message === 'canvas-empty') toast.error('Desenhe a assinatura no canvas');
      else if (e?.message === 'no-rep-name') toast.error('Nome do representante obrigatório');
      else toast.error('Erro ao salvar assinatura');
    },
  });

  const { mutate: removeHotelSig } = useMutation({
    mutationFn: () => api.delete('/settings/assinatura'),
    onSuccess: () => {
      setHotelSigPreview('');
      setHotelRepName('');
      hotelSigRef.current?.clear();
      toast.success('Assinatura removida');
    },
  });

  function handleUploadSig(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!hotelRepName.trim()) { toast.error('Informe o nome do representante primeiro'); return; }
      const img = new Image();
      img.onload = async () => {
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0);
        const png = cv.toDataURL('image/png');
        try {
          await api.post('/settings/assinatura', { assinatura_base64: png, nome_representante: hotelRepName.trim() });
          setHotelSigPreview(png);
          toast.success('Assinatura salva!');
        } catch { toast.error('Erro ao salvar'); }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  const { mutate: doBackup, isPending: backing } = useMutation({
    mutationFn: () => api.post('/settings/backup', {}),
    onSuccess: () => { toast.success('Backup criado!'); queryClient.invalidateQueries({ queryKey: ['settings-backups'] }); },
    onError: () => toast.error('Erro'),
  });

  const { mutate: doRestore, variables: restoringFname, isPending: restoring } = useMutation({
    mutationFn: (fname: string) => api.post(`/settings/backup/restore/${fname}`, {}),
    onSuccess: () => toast.success('Restaurado!'),
    onError: () => toast.error('Erro ao restaurar'),
  });

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('settings.title')}</h1>
        <Button loading={saving} onClick={() => saveSettings()}>{t('common.save')}</Button>
      </div>

      {/* Identity */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.identity')}</p>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.logo')}</p>
            {logoPreview
              ? <div className="flex items-center gap-3"><img src={logoPreview} alt="Logo" className="h-14 w-14 rounded-xl object-contain border" style={{ borderColor: 'var(--border)' }} /><Button size="sm" variant="ghost" onClick={() => removeLogo()}>Remover</Button></div>
              : <FileUpload accept="image/png,image/jpeg,image/webp" maxMB={2} label={uploadingLogo ? 'Enviando...' : 'Alterar logo'} onFile={f => uploadLogo(f)} />
            }
          </div>
          <Input label={t('settings.hotel_name')} value={form.nome_estabelecimento || ''} onChange={e => set('nome_estabelecimento', e.target.value)} />
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.primary_color')}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} className="w-8 h-8 rounded-full border-2 hover:scale-110 transition-transform" style={{ background: c, borderColor: form.cor_primaria === c ? '#000' : 'transparent' }} onClick={() => set('cor_primaria', c)} />
              ))}
              <input type="color" value={form.cor_primaria || '#F97316'} onChange={e => set('cor_primaria', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0" />
            </div>
          </div>
        </div>
      </Card>

      {/* Contact */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.contact')}</p>
        <div className="flex flex-col gap-3">
          <PhoneInput label={t('common.phone')} value={form.telefone_contato || ''} onChange={v => set('telefone_contato', v)} />
          <Input label={t('settings.city')} value={form.cidade || ''} onChange={e => set('cidade', e.target.value)} />
          <div>
            <Input label={t('settings.base_url')} value={form.base_url || ''} onChange={e => set('base_url', e.target.value)} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('settings.base_url_hint')}</p>
          </div>
        </div>
      </Card>

      {/* Booking settings */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.booking_settings')}</p>
        <div className="flex flex-col gap-3">
          <Input label={t('settings.daily_rate')} type="number" min="0" step="0.01" value={form.diaria_base || ''} onChange={e => set('diaria_base', parseFloat(e.target.value) || 0)} />
          <div>
            <Input label={t('settings.contract_validity')} type="number" min="1" value={form.contrato_validade_horas || ''} onChange={e => set('contrato_validade_horas', e.target.value ? parseInt(e.target.value) : null as any)} placeholder="∞" />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('settings.contract_validity_hint')}</p>
          </div>
        </div>
      </Card>

      {/* System */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.system')}</p>
        <div className="flex flex-col gap-3">
          <Select
            label={t('settings.default_lang')}
            options={[{ value: 'pt', label: t('settings.pt') }, { value: 'en', label: t('settings.en') }]}
            value={form.idioma_padrao || 'pt'}
            onChange={e => set('idioma_padrao', e.target.value as 'pt' | 'en')}
          />
          <Select
            label={t('settings.default_theme')}
            options={[{ value: 'light', label: `☀️ ${t('settings.light')}` }, { value: 'dark', label: `🌙 ${t('settings.dark')}` }]}
            value={form.tema_padrao || 'light'}
            onChange={e => set('tema_padrao', e.target.value as 'light' | 'dark')}
          />
        </div>
      </Card>

      {/* Hotel signature */}
      <HotelSignatureCard
        preview={hotelSigPreview}
        repName={hotelRepName}
        sigRef={hotelSigRef}
        saving={savingSig}
        onNameChange={setHotelRepName}
        onSave={() => saveHotelSig()}
        onRemove={() => removeHotelSig()}
        onUpload={handleUploadSig}
      />

      {/* Clauses */}
      <Card>
        <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Cláusulas do Contrato</p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Edite as cláusulas que aparecem no PDF e na página de assinatura ({lang === 'en' ? 'EN' : 'PT'}).
        </p>
        <div className="flex flex-col gap-3">
          {clausulas.map((c, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-xs font-bold mt-2.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
              <Textarea value={c} rows={2} onChange={e => setClausulas(prev => prev.map((x, j) => j === i ? e.target.value : x))} />
              <button className="mt-2 text-sm opacity-50 hover:opacity-100 flex-shrink-0" style={{ color: 'var(--color-danger)' }} onClick={() => setClausulas(prev => prev.filter((_, j) => j !== i))} title="Remover">✕</button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="self-start" onClick={() => setClausulas(prev => [...prev, `${prev.length + 1}. Nova cláusula`])}>
            + Adicionar Cláusula
          </Button>
        </div>
      </Card>

      {/* MFA */}
      <MfaSection />

      {/* Password */}
      <PasswordSection />

      {/* Backup */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.backup')}</p>
        <Button variant="secondary" loading={backing} onClick={() => doBackup()} className="mb-4">{t('settings.manual_backup')}</Button>
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{t('settings.backups_list')}</p>
        {backups.length === 0
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('settings.no_backups')}</p>
          : backups.slice(0, 10).map(b => (
            <div key={b.fname} className="flex items-center gap-2 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex-1">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.fname}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(b.mtime).toLocaleString('pt-BR')} · {Math.round(b.size / 1024)}KB</p>
              </div>
              <Button size="sm" variant="ghost" loading={restoring && restoringFname === b.fname} onClick={() => doRestore(b.fname)}>{t('settings.restore')}</Button>
            </div>
          ))
        }
      </Card>

      <div className="flex justify-end pb-4">
        <Button loading={saving} onClick={() => saveSettings()}>{t('common.save')}</Button>
      </div>
    </div>
  );
}
