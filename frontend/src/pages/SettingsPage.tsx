import { useEffect, useState, useRef } from 'react';
import api, { resolveFileUrl } from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
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

function PasswordSection() {
  const { toast } = useToast();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (nova.length < 6) { setErr('Mínimo 6 caracteres'); return; }
    if (nova !== confirma) { setErr('Senhas não coincidem'); return; }
    setSaving(true); setErr('');
    try {
      await api.post('/settings/password', { senha_atual: atual || undefined, senha_nova: nova });
      toast('Senha alterada!');
      setAtual(''); setNova(''); setConfirma('');
    } catch (e: any) { setErr(e?.error || 'Erro ao alterar senha'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Senha de acesso</p>
      <div className="flex flex-col gap-3 max-w-sm">
        <Input label="Senha atual" type="password" value={atual} onChange={e => setAtual(e.target.value)} placeholder="Deixe vazio se ainda não definiu" />
        <Input label="Nova senha" type="password" value={nova} onChange={e => setNova(e.target.value)} />
        <Input label="Confirmar nova senha" type="password" value={confirma} onChange={e => setConfirma(e.target.value)} />
        {err && <p className="text-sm text-red-500">{err}</p>}
        <Button onClick={save} loading={saving} variant="secondary">Alterar senha</Button>
      </div>
    </Card>
  );
}

const PRESET_COLORS = ['#F97316', '#10B981', '#6366F1', '#EC4899', '#EF4444', '#F59E0B'];

interface Backup { fname: string; size: number; mtime: string }

// ── Hotel Signature Card ──────────────────────────────────────────────────────
interface HotelSigProps {
  preview: string;
  repName: string;
  sigRef: React.RefObject<SignatureCanvasHandle>;
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
          <img
            src={preview}
            alt="Assinatura do hotel"
            className="h-20 border rounded-xl object-contain bg-white px-2"
            style={{ borderColor: 'var(--border)', maxWidth: 220 }}
          />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{repName}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Representante do estabelecimento</p>
            <Button size="sm" variant="danger" className="mt-2" onClick={onRemove}>Remover</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input
            label="Nome do representante"
            placeholder="Nome completo"
            value={repName}
            onChange={e => onNameChange(e.target.value)}
          />

          {/* Mode tabs */}
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
              <FileUpload
                accept="image/png,image/jpeg,image/webp"
                maxMB={2}
                label="Arraste a imagem da assinatura ou clique aqui"
                onFile={onUpload}
              />
            </div>
          )}

          <Button loading={saving} onClick={onSave} className="self-start">
            Salvar Assinatura
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { t, lang, setLang } = useTranslation();
  const { setTheme } = useTheme();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Partial<Settings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clausulas, setClausulas] = useState<string[]>([]);
  const [hotelSigPreview, setHotelSigPreview] = useState('');
  const [hotelRepName, setHotelRepName] = useState('');
  const [savingSig, setSavingSig] = useState(false);
  const hotelSigRef = useRef<SignatureCanvasHandle>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  function load() {
    Promise.all([api.get('/settings'), api.get('/settings/backup/list')])
      .then(([sRes, bRes]: any[]) => {
        setSettings(sRes.data);
        setForm(sRes.data);
        setBackups(bRes.data);
        const cl = lang === 'en' ? sRes.data.clausulas_en : sRes.data.clausulas_pt;
        setClausulas(cl || []);
        setHotelRepName(sRes.data.nome_hotel_assinante || '');
        if (sRes.data.assinatura_hotel_path) {
          const url = resolveFileUrl(sRes.data.assinatura_hotel_path);
          if (url) setHotelSigPreview(`${url}?t=${Date.now()}`);
        }
        if (sRes.data.logo_path) {
          const url = resolveFileUrl(sRes.data.logo_path);
          if (url) setLogoPreview(url);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      const clausulasKey = lang === 'en' ? 'clausulas_en' : 'clausulas_pt';
      await api.put('/settings', { ...form, [clausulasKey]: clausulas });
      setLang((form.idioma_padrao as 'pt' | 'en') || 'pt');
      setTheme((form.tema_padrao as 'light' | 'dark') || 'light');
      toast(t('settings.saved'));
      load();
    } catch { toast(t('errors.generic'), 'error'); }
    finally { setSaving(false); }
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    const fd = new FormData();
    fd.append('logo', file);
    try {
      await api.post('/settings/logo', fd);
      const preview = URL.createObjectURL(file);
      setLogoPreview(preview);
      toast('Logo atualizado!');
    } catch { toast('Erro no upload', 'error'); }
    finally { setUploadingLogo(false); }
  }

  async function saveHotelSig() {
    if (hotelSigRef.current?.isEmpty()) { toast('Desenhe a assinatura no canvas', 'error'); return; }
    if (!hotelRepName.trim()) { toast('Nome do representante obrigatório', 'error'); return; }
    setSavingSig(true);
    try {
      const sig = hotelSigRef.current!.toDataURL();
      await api.post('/settings/assinatura', { assinatura_base64: sig, nome_representante: hotelRepName.trim() });
      setHotelSigPreview(sig);
      toast('Assinatura salva!');
    } catch { toast('Erro ao salvar assinatura', 'error'); }
    finally { setSavingSig(false); }
  }

  async function removeHotelSig() {
    await api.delete('/settings/assinatura');
    setHotelSigPreview('');
    setHotelRepName('');
    hotelSigRef.current?.clear();
    toast('Assinatura removida');
  }

  async function doBackup() {
    setBacking(true);
    try { await api.post('/settings/backup', {}); toast('Backup criado!'); load(); }
    catch { toast('Erro', 'error'); }
    finally { setBacking(false); }
  }

  async function doRestore(fname: string) {
    setRestoring(fname);
    try { await api.post(`/settings/backup/restore/${fname}`, {}); toast('Restaurado!'); }
    catch { toast('Erro ao restaurar', 'error'); }
    finally { setRestoring(null); }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('settings.title')}</h1>
        <Button loading={saving} onClick={save}>{t('common.save')}</Button>
      </div>

      {/* Identity */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.identity')}</p>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.logo')}</p>
            {logoPreview
              ? <div className="flex items-center gap-3"><img src={logoPreview} alt="Logo" className="h-14 w-14 rounded-xl object-contain border" style={{ borderColor: 'var(--border)' }} /><Button size="sm" variant="ghost" onClick={async () => { await api.delete('/settings/logo'); setLogoPreview(''); load(); }}>Remover</Button></div>
              : <FileUpload accept="image/png,image/jpeg,image/webp" maxMB={2} label={uploadingLogo ? 'Enviando...' : 'Alterar logo'} onFile={uploadLogo} />
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
        onSave={saveHotelSig}
        onRemove={removeHotelSig}
        onUpload={async (file) => {
          // Convert uploaded image to base64 PNG and save
          const reader = new FileReader();
          reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            if (!hotelRepName.trim()) { toast('Informe o nome do representante primeiro', 'error'); return; }
            setSavingSig(true);
            try {
              // Normalize to PNG via canvas
              const img = new Image();
              img.onload = async () => {
                const cv = document.createElement('canvas');
                cv.width = img.width; cv.height = img.height;
                const ctx = cv.getContext('2d')!;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, cv.width, cv.height);
                ctx.drawImage(img, 0, 0);
                const png = cv.toDataURL('image/png');
                try {
                  await api.post('/settings/assinatura', { assinatura_base64: png, nome_representante: hotelRepName.trim() });
                  setHotelSigPreview(png);
                  toast('Assinatura salva!');
                } catch { toast('Erro ao salvar', 'error'); }
                finally { setSavingSig(false); }
              };
              img.src = dataUrl;
            } catch { setSavingSig(false); }
          };
          reader.readAsDataURL(file);
        }}
      />

      {/* Clauses editor */}
      <Card>
        <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Cláusulas do Contrato</p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Edite as cláusulas que aparecem no PDF e na página de assinatura ({lang === 'en' ? 'EN' : 'PT'}).
        </p>
        <div className="flex flex-col gap-3">
          {clausulas.map((c, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-xs font-bold mt-2.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
              <Textarea
                value={c}
                rows={2}
                onChange={e => setClausulas(prev => prev.map((x, j) => j === i ? e.target.value : x))}
              />
              <button
                className="mt-2 text-sm opacity-50 hover:opacity-100 flex-shrink-0"
                style={{ color: 'var(--color-danger)' }}
                onClick={() => setClausulas(prev => prev.filter((_, j) => j !== i))}
                title="Remover"
              >✕</button>
            </div>
          ))}
          <Button
            variant="outline" size="sm" className="self-start"
            onClick={() => setClausulas(prev => [...prev, `${prev.length + 1}. Nova cláusula`])}
          >
            + Adicionar Cláusula
          </Button>
        </div>
      </Card>

      {/* Password */}
      <PasswordSection />

      {/* Backup */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.backup')}</p>
        <Button variant="secondary" loading={backing} onClick={doBackup} className="mb-4">{t('settings.manual_backup')}</Button>
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{t('settings.backups_list')}</p>
        {backups.length === 0
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('settings.no_backups')}</p>
          : backups.slice(0, 10).map(b => (
            <div key={b.fname} className="flex items-center gap-2 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex-1">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.fname}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(b.mtime).toLocaleString('pt-BR')} · {Math.round(b.size / 1024)}KB</p>
              </div>
              <Button size="sm" variant="ghost" loading={restoring === b.fname} onClick={() => doRestore(b.fname)}>{t('settings.restore')}</Button>
            </div>
          ))
        }
      </Card>

      <div className="flex justify-end pb-4">
        <Button loading={saving} onClick={save}>{t('common.save')}</Button>
      </div>
    </div>
  );
}
