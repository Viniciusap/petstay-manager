import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import { useTheme } from '../contexts/ThemeContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import PhoneInput from '../components/ui/PhoneInput';
import FileUpload from '../components/ui/FileUpload';
import SignatureCanvas, { SignatureCanvasHandle } from '../components/signing/SignatureCanvas';

const PRESET_COLORS = ['#F97316', '#10B981', '#6366F1', '#EC4899', '#EF4444', '#F59E0B'];

interface FormData {
  nome_estabelecimento: string;
  logo_file: File | null;
  logo_preview: string;
  cor_primaria: string;
  telefone_contato: string;
  cidade: string;
  base_url: string;
  diaria_base: number;
  nome_representante: string;
  idioma_padrao: 'pt' | 'en';
  tema_padrao: 'light' | 'dark';
}

interface SigBlockProps {
  repName: string;
  sigRef: React.RefObject<SignatureCanvasHandle | null>;
  onNameChange: (v: string) => void;
}

function OnboardingSignatureBlock({ repName, sigRef, onNameChange }: SigBlockProps) {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [uploadPreview, setUploadPreview] = useState('');

  function handleUpload(file: File) {
    const reader = new FileReader();
    reader.onload = e => setUploadPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    (sigRef as any)._uploadedFile = file;
  }

  return (
    <div className="rounded-xl border p-3 flex flex-col gap-3" style={{ borderColor: 'var(--border)' }}>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>✍️ Assinatura do Representante</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Opcional — aparece automaticamente em todos os contratos</p>
      </div>

      <input
        type="text"
        placeholder="Nome do representante"
        value={repName}
        onChange={e => onNameChange(e.target.value)}
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
      />

      <div className="flex gap-1 p-1 rounded-xl self-start" style={{ background: 'var(--bg-hover)' }}>
        {(['draw', 'upload'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: mode === m ? 'var(--bg-card)' : 'transparent',
              color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {m === 'draw' ? '✍️ Desenhar' : '📁 Enviar imagem'}
          </button>
        ))}
      </div>

      {mode === 'draw' ? (
        <div className="flex flex-col gap-1">
          <div className="flex justify-end">
            <button className="text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => sigRef.current?.clear()}>Limpar</button>
          </div>
          <SignatureCanvas ref={sigRef} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {uploadPreview
            ? (
              <div className="flex items-center gap-3">
                <img src={uploadPreview} alt="Assinatura" className="h-16 border rounded-lg object-contain bg-white px-2" style={{ borderColor: 'var(--border)', maxWidth: 160 }} />
                <button className="text-xs underline" style={{ color: 'var(--color-danger)' }} onClick={() => { setUploadPreview(''); (sigRef as any)._uploadedFile = null; }}>Remover</button>
              </div>
            )
            : (
              <label className="cursor-pointer rounded-xl border-2 border-dashed p-4 text-center block" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Arraste ou clique para enviar</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>PNG, JPG · máx. 2MB</p>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              </label>
            )
          }
        </div>
      )}
    </div>
  );
}

export function OnboardingPage() {
  const { t, setLang } = useTranslation();
  const { setTheme } = useTheme();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const [form, setForm] = useState<FormData>({
    nome_estabelecimento: '',
    logo_file: null,
    logo_preview: '',
    cor_primaria: '#F97316',
    telefone_contato: '',
    cidade: '',
    base_url: 'http://localhost:5173',
    diaria_base: 80,
    idioma_padrao: 'pt',
    tema_padrao: 'light',
    nome_representante: '',
  });
  const sigRef = useRef<SignatureCanvasHandle | null>(null);

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function validate(s: number): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (s === 1 && !form.nome_estabelecimento.trim()) e.nome_estabelecimento = t('errors.required');
    if (s === 2) {
      if (!form.telefone_contato.trim()) e.telefone_contato = t('errors.required');
      if (!form.cidade.trim()) e.cidade = t('errors.required');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validate(step)) return;
    setStep(s => s + 1);
  }

  const { mutate: finish, isPending: saving } = useMutation({
    mutationFn: async () => {
      await api.put('/settings', {
        nome_estabelecimento: form.nome_estabelecimento,
        cor_primaria: form.cor_primaria,
        telefone_contato: form.telefone_contato,
        cidade: form.cidade,
        base_url: form.base_url,
        diaria_base: form.diaria_base,
        idioma_padrao: form.idioma_padrao,
        tema_padrao: form.tema_padrao,
        onboarding_completo: true,
      });

      if (form.logo_file) {
        const fd = new FormData();
        fd.append('logo', form.logo_file);
        try { await api.post('/settings/logo', fd); } catch { /* non-fatal */ }
      }

      if (form.nome_representante.trim()) {
        const uploadedFile = (sigRef as any)._uploadedFile as File | null;
        let sigBase64: string | null = null;

        if (uploadedFile) {
          sigBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const img = new Image();
              img.onload = () => {
                const cv = document.createElement('canvas');
                cv.width = img.width; cv.height = img.height;
                const ctx = cv.getContext('2d')!;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, cv.width, cv.height);
                ctx.drawImage(img, 0, 0);
                resolve(cv.toDataURL('image/png'));
              };
              img.src = e.target?.result as string;
            };
            reader.readAsDataURL(uploadedFile);
          });
        } else if (sigRef.current && !sigRef.current.isEmpty()) {
          sigBase64 = sigRef.current.toDataURL();
        }

        if (sigBase64) {
          try {
            await api.post('/settings/assinatura', {
              assinatura_base64: sigBase64,
              nome_representante: form.nome_representante.trim(),
            });
          } catch { /* non-fatal */ }
        }
      }
    },
    onSuccess: () => {
      setLang(form.idioma_padrao);
      setTheme(form.tema_padrao);
      setDone(true);
    },
    onError: () => toast.error('Erro ao salvar configurações. Tente novamente.'),
  });

  function handleFinish() {
    if (!validate(3)) return;
    finish();
  }

  function handleLogoFile(file: File) {
    set('logo_file', file);
    const reader = new FileReader();
    reader.onload = e => set('logo_preview', e.target?.result as string);
    reader.readAsDataURL(file);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-6">
          <div className="text-6xl">✅</div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
              {t('onboarding.success_title')}
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              {t('onboarding.success_message')} {form.nome_estabelecimento && `${form.nome_estabelecimento}!`}
            </p>
          </div>
          <Button onClick={() => navigate('/')} size="lg">{t('onboarding.go_to_dashboard')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>🐾 PetStay Manager</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
            {t('onboarding.welcome')}
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{t('onboarding.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="h-1.5 flex-1 rounded-full transition-all" style={{ background: s <= step ? 'var(--color-primary)' : 'var(--border)' }} />
          ))}
        </div>
        <p className="text-xs text-center mb-6" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step_of', { step: String(step), total: '3' })}
        </p>

        <div className="rounded-2xl shadow-sm p-6 flex flex-col gap-5" style={{ background: 'var(--bg-card)' }}>
          {step === 1 && (
            <>
              <h2 className="font-semibold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
                {t('onboarding.step1_title')}
              </h2>
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('onboarding.logo_label')}</p>
                {form.logo_preview
                  ? (
                    <div className="flex items-center gap-4">
                      <img src={form.logo_preview} alt="Logo" className="h-16 w-16 rounded-xl object-contain border" style={{ borderColor: 'var(--border)' }} />
                      <Button variant="ghost" size="sm" onClick={() => { set('logo_file', null); set('logo_preview', ''); }}>Remover</Button>
                    </div>
                  )
                  : <FileUpload accept="image/png,image/jpeg,image/webp" maxMB={2} label={t('onboarding.logo_label')} hint={t('onboarding.logo_hint')} onFile={handleLogoFile} />
                }
              </div>
              <Input
                label={t('onboarding.hotel_name_label')}
                placeholder={t('onboarding.hotel_name_placeholder')}
                value={form.nome_estabelecimento}
                onChange={e => set('nome_estabelecimento', e.target.value)}
                error={errors.nome_estabelecimento}
              />
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('onboarding.color_label')}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} className="w-8 h-8 rounded-full transition-transform hover:scale-110 border-2" style={{ background: c, borderColor: form.cor_primaria === c ? '#000' : 'transparent' }} onClick={() => set('cor_primaria', c)} />
                  ))}
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('onboarding.color_custom')}:</span>
                    <input type="color" value={form.cor_primaria} onChange={e => set('cor_primaria', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-semibold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
                {t('onboarding.step2_title')}
              </h2>
              <PhoneInput
                label={t('onboarding.phone_label')}
                value={form.telefone_contato}
                onChange={v => { set('telefone_contato', v); setErrors(e => ({ ...e, telefone_contato: '' })); }}
                error={errors.telefone_contato}
              />
              <Input
                label={t('onboarding.city_label')}
                placeholder="São Paulo - SP"
                value={form.cidade}
                onChange={e => set('cidade', e.target.value)}
                error={errors.cidade}
              />
              <div>
                <Input
                  label={t('onboarding.url_label')}
                  placeholder="http://localhost:3001"
                  value={form.base_url}
                  onChange={e => set('base_url', e.target.value)}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('onboarding.url_hint')}</p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-semibold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
                {t('onboarding.step3_title')}
              </h2>
              <Input
                label={t('onboarding.daily_rate_label')}
                type="number"
                min="0"
                step="0.01"
                value={form.diaria_base}
                onChange={e => set('diaria_base', parseFloat(e.target.value) || 0)}
              />
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('onboarding.lang_label')}</p>
                <div className="flex gap-3">
                  {(['pt', 'en'] as const).map(l => (
                    <label key={l} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={form.idioma_padrao === l} onChange={() => set('idioma_padrao', l)} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{l === 'pt' ? 'Português (BR)' : 'English'}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('onboarding.theme_label')}</p>
                <div className="flex gap-3">
                  {(['light', 'dark'] as const).map(th => (
                    <label key={th} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={form.tema_padrao === th} onChange={() => set('tema_padrao', th)} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{th === 'light' ? '☀️ Claro' : '🌙 Escuro'}</span>
                    </label>
                  ))}
                </div>
              </div>
              <OnboardingSignatureBlock repName={form.nome_representante} sigRef={sigRef} onNameChange={v => set('nome_representante', v)} />
              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>{t('onboarding.preview_label')}</p>
                <div className="flex items-center gap-3">
                  {form.logo_preview
                    ? <img src={form.logo_preview} alt="Logo" className="h-10 w-10 rounded-lg object-contain" />
                    : <div className="h-10 w-10 rounded-lg flex items-center justify-center text-xl" style={{ background: 'var(--bg-hover)' }}>🐾</div>
                  }
                  <div>
                    <p className="text-sm font-bold" style={{ color: form.cor_primaria }}>{form.nome_estabelecimento || 'Meu Hotel'}</p>
                    <div className="h-1 w-24 rounded-full mt-1" style={{ background: form.cor_primaria }} />
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between mt-2">
            {step > 1
              ? <Button variant="ghost" onClick={() => setStep(s => s - 1)}>{t('common.back')}</Button>
              : <div />
            }
            {step < 3
              ? <Button onClick={next}>{t('common.next')} →</Button>
              : <Button onClick={handleFinish} loading={saving}>{t('onboarding.finish_button')}</Button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
