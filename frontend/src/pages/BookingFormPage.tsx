import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import PhoneInput from '../components/ui/PhoneInput';
import Textarea from '../components/ui/Textarea';
import Select from '../components/ui/Select';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import type { Tutor, Animal, Service, Settings } from '../types';

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

const STEPS = ['tutor', 'animal', 'dates', 'services', 'review'] as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export function BookingFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [selectedTutor, setSelectedTutor] = useState<Tutor | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [dataEntrada, setDataEntrada] = useState('');
  const [dataSaida, setDataSaida] = useState('');
  const [valorDiaria, setValorDiaria] = useState(80);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [tutorSearch, setTutorSearch] = useState('');
  const [newTutor, setNewTutor] = useState({ nome: '', telefone: '', email: '' });
  const [addingTutor, setAddingTutor] = useState(false);
  const [newAnimal, setNewAnimal] = useState({ nome: '', especie: 'cachorro', raca: '' });
  const [addingAnimal, setAddingAnimal] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/settings').then(r => {
      const base = r.data?.diaria_base ?? 80;
      setValorDiaria(base);
      return r.data;
    }),
  });

  const { data: tutors = [] } = useQuery({
    queryKey: ['tutors', tutorSearch],
    queryFn: () => api.get<Tutor[]>(`/tutors${tutorSearch ? `?q=${tutorSearch}` : ''}`).then(r => r.data ?? []),
  });

  const { data: animals = [] } = useQuery({
    queryKey: ['animals-by-tutor', selectedTutor?.id],
    queryFn: () => api.get<Animal[]>(`/animals?tutor_id=${selectedTutor!.id}`).then(r => r.data ?? []),
    enabled: !!selectedTutor?.id,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services').then(r => r.data ?? []),
  });

  const { mutate: createTutor } = useMutation({
    mutationFn: () => api.post<Tutor>('/tutors', newTutor),
    onSuccess: (res) => {
      setSelectedTutor(res.data!);
      setAddingTutor(false);
      setStep(1);
    },
    onError: () => toast.error('Erro ao criar tutor'),
  });

  const { mutate: createAnimal } = useMutation({
    mutationFn: () => api.post<Animal>('/animals', { ...newAnimal, tutor_id: selectedTutor!.id }),
    onSuccess: (res) => {
      setSelectedAnimal(res.data!);
      setAddingAnimal(false);
      setStep(2);
    },
    onError: () => toast.error('Erro ao criar animal'),
  });

  const { mutate: submit, isPending: saving } = useMutation({
    mutationFn: () => api.post<{ booking: { id: string } }>('/bookings', {
      tutor_id: selectedTutor!.id,
      animal_id: selectedAnimal!.id,
      data_entrada: dataEntrada,
      data_saida: dataSaida,
      valor_diaria: valorDiaria,
      servicos_adicionais: selectedServices.map(s => ({ servico_id: s.id, nome: s.nome, nome_en: s.nome_en, valor: s.valor })),
      observacoes,
    }),
    onSuccess: (res) => {
      toast.success('Reserva criada com sucesso!');
      navigate(`/bookings/${res.data!.booking.id}`);
    },
    onError: () => toast.error('Erro ao criar reserva'),
  });

  const nights = (() => {
    if (!dataEntrada || !dataSaida) return 0;
    const [ay, am, ad] = dataEntrada.split('-').map(Number);
    const [by, bm, bd] = dataSaida.split('-').map(Number);
    const a = new Date(ay, am - 1, ad);
    const b = new Date(by, bm - 1, bd);
    const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
    return Math.max(1, days);
  })();
  const extrasTotal = selectedServices.reduce((s, srv) => s + srv.valor, 0);
  const total = nights * valorDiaria + extrasTotal;

  const stepLabels = [t('booking.form.step1'), t('booking.form.step2'), t('booking.form.step3'), t('booking.form.step4'), t('booking.form.step5')];

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/bookings')}>← {t('common.back')}</Button>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('booking.new')}</h1>
      </div>

      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? 'var(--color-primary)' : 'var(--border)' }} />
        ))}
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{stepLabels[step]}</p>

      <Card>
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <Input placeholder={t('common.search')} value={tutorSearch} onChange={e => setTutorSearch(e.target.value)} />
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {tutors.map(t2 => (
                <div
                  key={t2.id}
                  className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderColor: selectedTutor?.id === t2.id ? 'var(--color-primary)' : 'var(--border)', background: 'var(--bg-card)' }}
                  onClick={() => { setSelectedTutor(t2); setSelectedAnimal(null); }}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t2.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t2.telefone}</p>
                  </div>
                  {selectedTutor?.id === t2.id && <span style={{ color: 'var(--color-primary)' }}>✓</span>}
                </div>
              ))}
            </div>
            {addingTutor
              ? (
                <div className="flex flex-col gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('booking.form.newTutor')}</p>
                  <Input placeholder="Nome*" value={newTutor.nome} onChange={e => setNewTutor(p => ({ ...p, nome: e.target.value }))} />
                  <PhoneInput placeholder="(11) 99999-9999" value={newTutor.telefone} onChange={v => setNewTutor(p => ({ ...p, telefone: v }))} />
                  <Input placeholder="Email" value={newTutor.email} onChange={e => setNewTutor(p => ({ ...p, email: e.target.value }))} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => createTutor()} disabled={!newTutor.nome || !newTutor.telefone}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingTutor(false)}>Cancelar</Button>
                  </div>
                </div>
              )
              : <Button variant="outline" size="sm" onClick={() => setAddingTutor(true)}>+ {t('booking.form.newTutor')}</Button>
            }
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tutor: <strong>{selectedTutor?.nome}</strong></p>
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {animals.map(a => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderColor: selectedAnimal?.id === a.id ? 'var(--color-primary)' : 'var(--border)', background: 'var(--bg-card)' }}
                  onClick={() => setSelectedAnimal(a)}
                >
                  <Avatar species={a.especie} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{a.especie} · {a.raca}</p>
                  </div>
                  {selectedAnimal?.id === a.id && <span style={{ color: 'var(--color-primary)' }}>✓</span>}
                </div>
              ))}
              {animals.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Nenhum animal cadastrado</p>}
            </div>
            {addingAnimal
              ? (
                <div className="flex flex-col gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('booking.form.newAnimal')}</p>
                  <Input placeholder="Nome*" value={newAnimal.nome} onChange={e => setNewAnimal(p => ({ ...p, nome: e.target.value }))} />
                  <Select
                    options={[{ value: 'cachorro', label: '🐶 Cachorro' }, { value: 'gato', label: '🐱 Gato' }, { value: 'outro', label: '🐾 Outro' }]}
                    value={newAnimal.especie}
                    onChange={e => setNewAnimal(p => ({ ...p, especie: e.target.value }))}
                  />
                  <Input placeholder="Raça" value={newAnimal.raca} onChange={e => setNewAnimal(p => ({ ...p, raca: e.target.value }))} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => createAnimal()} disabled={!newAnimal.nome}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingAnimal(false)}>Cancelar</Button>
                  </div>
                </div>
              )
              : <Button variant="outline" size="sm" onClick={() => setAddingAnimal(true)}>+ {t('booking.form.newAnimal')}</Button>
            }
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <Input label={t('booking.fields.checkin_date')} type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} />
            <Input label={t('booking.fields.checkout_date')} type="date" value={dataSaida} min={dataEntrada} onChange={e => setDataSaida(e.target.value)} />
            <Input label={t('booking.fields.daily_rate')} type="number" min="0" step="0.01" value={valorDiaria} onChange={e => setValorDiaria(parseFloat(e.target.value) || 0)} />
            {nights > 0 && (
              <div className="p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{nights} {t('booking.form.nights')} × {fmtBRL(valorDiaria)} = <strong style={{ color: 'var(--text-primary)' }}>{fmtBRL(nights * valorDiaria)}</strong></p>
              </div>
            )}
            <Textarea label={t('booking.fields.notes')} value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            {services.length === 0
              ? <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Nenhum serviço cadastrado</p>
              : services.map(s => {
                const checked = selectedServices.some(ss => ss.id === s.id);
                return (
                  <label key={s.id} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: checked ? 'var(--color-primary)' : 'var(--border)', background: 'var(--bg-card)' }}>
                    <input type="checkbox" checked={checked} onChange={e => {
                      setSelectedServices(prev => e.target.checked ? [...prev, s] : prev.filter(ss => ss.id !== s.id));
                    }} />
                    <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{s.nome}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>{fmtBRL(s.valor)}</span>
                  </label>
                );
              })
            }
            {extrasTotal > 0 && (
              <p className="text-sm text-right" style={{ color: 'var(--text-secondary)' }}>
                Extras: <strong style={{ color: 'var(--text-primary)' }}>{fmtBRL(extrasTotal)}</strong>
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3">
            <Row label="Tutor" value={selectedTutor?.nome || ''} />
            <Row label="Animal" value={`${selectedAnimal?.nome} (${selectedAnimal?.especie})`} />
            <Row label="Entrada" value={dataEntrada ? new Date(dataEntrada).toLocaleDateString('pt-BR') : ''} />
            <Row label="Saída" value={dataSaida ? new Date(dataSaida).toLocaleDateString('pt-BR') : ''} />
            <Row label="Diárias" value={`${nights} × ${fmtBRL(valorDiaria)}`} />
            {selectedServices.map(s => <Row key={s.id} label={s.nome} value={fmtBRL(s.valor)} />)}
            <div className="pt-2 border-t flex justify-between" style={{ borderColor: 'var(--border)' }}>
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
              <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{fmtBRL(total)}</span>
            </div>
          </div>
        )}
      </Card>

      <div className="flex justify-between">
        {step > 0
          ? <Button variant="ghost" onClick={() => setStep(s => s - 1)}>{t('common.back')}</Button>
          : <Button variant="ghost" onClick={() => navigate('/bookings')}>{t('common.cancel')}</Button>
        }
        {step < 4
          ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={
                (step === 0 && !selectedTutor) ||
                (step === 1 && !selectedAnimal) ||
                (step === 2 && (!dataEntrada || !dataSaida))
              }
            >
              {t('common.next')} →
            </Button>
          )
          : <Button onClick={() => submit()} loading={saving}>Criar Reserva</Button>
        }
      </div>
    </div>
  );
}
