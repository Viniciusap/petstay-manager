import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { resolveFileUrl, apiBase } from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import { useTheme } from '../contexts/ThemeContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';
import SignatureCanvas, { SignatureCanvasHandle } from '../components/signing/SignatureCanvas';
import type { Contract, Booking, Animal, Tutor, Settings } from '../types';

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR'); }
function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

const CLAUSULAS_PT = [
  '1. Responsabilidade: O estabelecimento se compromete a zelar pelo bem-estar, alimentação e segurança do animal durante o período contratado.',
  '2. Saúde e Vacinação: O responsável declara que o animal está com as vacinas em dia e apto para conviver com outros animais.',
  '3. Pagamento: O valor acordado deve ser quitado conforme combinado. A não quitação poderá resultar em retenção do animal.',
  '4. Cancelamento: Cancelamentos com menos de 48h de antecedência estão sujeitos à cobrança de 50% do valor total.',
  '5. Emergências: O estabelecimento está autorizado a tomar decisões veterinárias emergenciais, sendo os custos de responsabilidade do tutor.',
  '6. Limitação: O estabelecimento não se responsabiliza por doenças preexistentes ou condições não informadas no check-in.',
];

const CLAUSULAS_EN = [
  '1. Liability: The establishment commits to ensuring the animal\'s well-being, feeding and safety during the contracted period.',
  '2. Health & Vaccination: The guardian declares the animal is fully vaccinated and fit to coexist with other animals.',
  '3. Payment: The agreed amount must be paid as arranged. Failure to pay may result in the animal being held.',
  '4. Cancellation: Cancellations less than 48h in advance are subject to a 50% charge of the total amount.',
  '5. Emergencies: The establishment is authorized to make emergency veterinary decisions; costs are the guardian\'s responsibility.',
  '6. Limitation: The establishment is not liable for pre-existing conditions or issues not disclosed at check-in.',
];

type State = 'loading' | 'invalid' | 'signed' | 'ready' | 'success';

export default function SigningPage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const { t, lang } = useTranslation();
  const { setTheme } = useTheme();

  const [state, setState] = useState<State>('loading');
  const [errorCode, setErrorCode] = useState('');
  const [contract, setContract] = useState<Contract | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [contractId, setContractId] = useState('');

  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState('');
  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [errors, setErrors] = useState({ terms: '', canvas: '', name: '' });
  const [signing, setSigning] = useState(false);
  const [pdfPath, setPdfPath] = useState('');

  const canvasRef = useRef<SignatureCanvasHandle>(null);

  useEffect(() => {
    if (!token) { setState('invalid'); setErrorCode('INVALID_TOKEN'); return; }

    api.get(`/contracts/token/${token}`).then((r: any) => {
      if (!r.success) {
        setErrorCode(r.code || 'INVALID_TOKEN');
        setState(r.code === 'ALREADY_SIGNED' ? 'signed' : 'invalid');
        return;
      }
      const { contract: c, booking: b, animal: a, tutor: tu, settings: s } = r.data;
      setContract(c);
      setContractId(c.id);
      setBooking(b);
      setAnimal(a);
      setTutor(tu);
      setSettings(s);
      if (s?.idioma_padrao) { /* lang set on context already */ }
      if (s?.tema_padrao) setTheme(s.tema_padrao);
      setState('ready');
    }).catch(() => { setState('invalid'); setErrorCode('INVALID_TOKEN'); });
  }, [token]);

  const onSign = useCallback(() => {
    setCanvasEmpty(canvasRef.current?.isEmpty() ?? true);
  }, []);

  function validate() {
    const e = { terms: '', canvas: '', name: '' };
    if (!accepted) e.terms = t('contract.signing.terms_error');
    if (canvasRef.current?.isEmpty()) e.canvas = t('contract.signing.canvas_empty_error');
    if (name.trim().length < 3) e.name = t('contract.signing.name_error');
    setErrors(e);
    return !e.terms && !e.canvas && !e.name;
  }

  async function submit() {
    if (!validate()) return;
    setSigning(true);
    try {
      const sig = canvasRef.current!.toDataURL();
      const r: any = await api.post(`/contracts/sign/${token}`, {
        assinatura_base64: sig,
        nome_digitado: name.trim(),
        aceite_termos: true,
      });
      setPdfPath(token ? `${apiBase}/contracts/pdf/by-token/${token}` : '');
      setState('success');
    } catch (err: any) {
      if (err?.code === 'ALREADY_SIGNED') setState('signed');
      else setErrors(e => ({ ...e, canvas: err?.error || t('errors.generic') }));
    } finally {
      setSigning(false);
    }
  }

  // Prefer server-side clauses (customized by hotel); fall back to defaults if not set
  const clausulas = lang === 'en'
    ? (settings?.clausulas_en?.length ? settings.clausulas_en : CLAUSULAS_EN)
    : (settings?.clausulas_pt?.length ? settings.clausulas_pt : CLAUSULAS_PT);
  const canSign = accepted && !canvasEmpty && name.trim().length >= 3;

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
            {t('contract.signing.invalid_token')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('contract.signing.invalid_token_hint')}</p>
        </div>
      </div>
    );
  }

  if (state === 'signed') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
            {t('contract.signing.already_signed')}
          </h1>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-5">
          <div className="text-6xl">✅</div>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>
              {t('contract.signing.success_title')}
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{t('contract.signing.success_message')}</p>
          </div>
          {pdfPath && (
            <a href={pdfPath} target="_blank" rel="noreferrer" className="w-full">
              <Button className="w-full" size="lg">📄 {t('contract.signing.download_pdf')}</Button>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-lg mx-auto pb-12">
        {/* Hotel header */}
        <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          {settings?.logo_path
            ? <img src={resolveFileUrl(settings.logo_path) ?? ''} alt="Logo" className="h-10 w-10 rounded-lg object-contain" />
            : <span className="text-3xl">🐾</span>
          }
          <div>
            <p className="font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'Plus Jakarta Sans' }}>
              {settings?.nome_estabelecimento || 'PetStay'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('contract.signing.title')}</p>
          </div>
        </div>

        <div className="px-4 flex flex-col gap-5 pt-5">
          {/* Booking summary */}
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>📋 {t('contract.signing.summary')}</p>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Pet:</span>
              <span style={{ color: 'var(--text-primary)' }}>{animal?.nome || '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Tutor:</span>
              <span style={{ color: 'var(--text-primary)' }}>{tutor?.nome || '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Entrada:</span>
              <span style={{ color: 'var(--text-primary)' }}>{booking?.data_entrada ? fmtDate(booking.data_entrada) : '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Saída:</span>
              <span style={{ color: 'var(--text-primary)' }}>{booking?.data_saida ? fmtDate(booking.data_saida) : '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Total:</span>
              <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{booking?.valor_total ? fmtBRL(booking.valor_total) : '—'}</span>
            </div>
          </div>

          {/* Terms */}
          <div className="rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <div className="px-4 pt-4 pb-2">
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>📄 {t('contract.signing.terms_title')}</p>
            </div>
            <div className="overflow-y-auto max-h-48 px-4 pb-4">
              {clausulas.map((c, i) => (
                <p key={i} className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{c}</p>
              ))}
            </div>
          </div>

          {/* Accept checkbox */}
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl border" style={{ borderColor: errors.terms ? 'var(--color-danger)' : 'var(--border)', background: 'var(--bg-card)' }}>
            <input
              type="checkbox"
              className="mt-0.5 flex-shrink-0"
              checked={accepted}
              onChange={e => { setAccepted(e.target.checked); setErrors(er => ({ ...er, terms: '' })); }}
            />
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('contract.signing.accept_label')}</span>
          </label>
          {errors.terms && <p className="text-xs -mt-3" style={{ color: 'var(--color-danger)' }}>{errors.terms}</p>}

          {/* Signature canvas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>✍️ {t('contract.signing.canvas_label')}</p>
              <button
                className="text-xs underline"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => { canvasRef.current?.clear(); setCanvasEmpty(true); }}
              >
                {t('contract.signing.clear_button')}
              </button>
            </div>
            <SignatureCanvas ref={canvasRef} onSign={onSign} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('contract.signing.canvas_hint')}</p>
            {errors.canvas && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.canvas}</p>}
          </div>

          {/* Name input */}
          <div>
            <Input
              label={t('contract.signing.name_label')}
              placeholder={t('contract.signing.name_placeholder')}
              value={name}
              onChange={e => { setName(e.target.value); setErrors(er => ({ ...er, name: '' })); }}
              error={errors.name}
            />
          </div>

          {/* Submit */}
          <Button
            onClick={submit}
            loading={signing}
            disabled={!canSign}
            aria-disabled={!canSign}
            size="lg"
            className="w-full"
          >
            {t('contract.signing.confirm_button')}
          </Button>
        </div>
      </div>
    </div>
  );
}
