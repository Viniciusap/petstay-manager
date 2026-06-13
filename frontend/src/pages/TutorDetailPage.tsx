import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import PhoneInput from '../components/ui/PhoneInput';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Card from '../components/ui/Card';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import { isValidEmail, isValidPhone } from '../lib/masks';
import type { Tutor, Animal, Booking } from '../types';

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR'); }
function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

const tutorSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  telefone: z.string().min(1, 'Telefone obrigatório').refine(isValidPhone, 'Telefone inválido'),
  email: z.string().optional().refine(v => !v || isValidEmail(v), 'E-mail inválido'),
  endereco: z.string().optional(),
});
type TutorFields = z.infer<typeof tutorSchema>;

const animalSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  especie: z.enum(['cachorro', 'gato', 'outro']),
  raca: z.string().optional(),
});
type AnimalFields = z.infer<typeof animalSchema>;

interface TutorWithAnimals extends Tutor { animals: Animal[] }

export function TutorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [animalModal, setAnimalModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tutor', id],
    queryFn: async () => {
      const [tRes, bRes] = await Promise.all([
        api.get<TutorWithAnimals>(`/tutors/${id}`),
        api.get<Booking[]>('/bookings?q='),
      ]);
      const tutor = tRes.data!;
      const bookings = (bRes.data ?? []).filter(b => b.tutor_id === id);
      return { tutor, animals: tutor.animals ?? [], bookings };
    },
  });

  const tutor = data?.tutor ?? null;
  const animals = data?.animals ?? [];
  const bookings = data?.bookings ?? [];

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<TutorFields>({
    resolver: zodResolver(tutorSchema),
  });

  function startEditing() {
    if (!tutor) return;
    reset({ nome: tutor.nome, telefone: tutor.telefone, email: tutor.email || '', endereco: tutor.endereco || '' });
    setEditing(true);
  }

  const { mutate: saveTutor, isPending: saving } = useMutation({
    mutationFn: (d: TutorFields) => api.put(`/tutors/${id}`, d),
    onSuccess: () => {
      toast.success('Salvo!');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['tutor', id] });
    },
    onError: () => toast.error('Erro'),
  });

  const { mutate: deleteTutor, isPending: deleting } = useMutation({
    mutationFn: () => api.delete(`/tutors/${id}`),
    onSuccess: () => {
      toast.success('Tutor removido');
      navigate('/tutors');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Erro ao remover');
      setConfirmDelete(false);
    },
  });

  const { mutate: deleteAccount, isPending: deletingAccount } = useMutation({
    mutationFn: () => api.delete(`/tutors/${id}/account`),
    onSuccess: () => {
      toast.success('Dados do tutor excluídos permanentemente (LGPD)');
      navigate('/tutors');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao excluir dados'),
  });
  const [confirmLgpd, setConfirmLgpd] = useState(false);
  const [lgpdConfirmText, setLgpdConfirmText] = useState('');

  const animalForm = useForm<AnimalFields>({
    resolver: zodResolver(animalSchema),
    defaultValues: { especie: 'cachorro' },
  });

  const { mutate: addAnimal, isPending: savingAnimal } = useMutation({
    mutationFn: (d: AnimalFields) => api.post('/animals', { ...d, tutor_id: id }),
    onSuccess: () => {
      toast.success('Animal cadastrado!');
      setAnimalModal(false);
      animalForm.reset({ especie: 'cachorro' });
      queryClient.invalidateQueries({ queryKey: ['tutor', id] });
    },
    onError: () => toast.error('Erro ao cadastrar animal'),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!tutor) return <p style={{ color: 'var(--text-muted)' }}>Tutor não encontrado.</p>;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tutors')}>← {t('common.back')}</Button>
      </div>

      <Card>
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--color-primary)' }}>
            {tutor.nome[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            {editing
              ? (
                <form onSubmit={handleSubmit(d => saveTutor(d))} className="flex flex-col gap-3">
                  <Input label="Nome" error={errors.nome?.message} {...register('nome')} />
                  <Controller
                    name="telefone"
                    control={control}
                    render={({ field }) => (
                      <PhoneInput label="Telefone" value={field.value} onChange={field.onChange} error={errors.telefone?.message} />
                    )}
                  />
                  <Input label="Email" type="email" inputMode="email" placeholder="nome@email.com" error={errors.email?.message} {...register('email')} />
                  <Input label="Endereço" {...register('endereco')} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={saving}>{t('common.save')}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
                  </div>
                </form>
              )
              : (
                <>
                  <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{tutor.nome}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>📞 {tutor.telefone}</p>
                  {tutor.email && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>✉️ {tutor.email}</p>}
                  {tutor.endereco && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>📍 {tutor.endereco}</p>}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="outline" onClick={startEditing}>{t('common.edit')}</Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>{t('common.delete')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setLgpdConfirmText(''); setConfirmLgpd(true); }} style={{ color: 'var(--color-danger)', fontSize: '0.7rem' }}>🗑 Excluir dados (LGPD)</Button>
                  </div>
                </>
              )
            }
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('tutor.animals')}</p>
          <Button size="sm" variant="outline" onClick={() => setAnimalModal(true)}>+ {t('animal.new')}</Button>
        </div>
        {animals.length === 0
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum animal cadastrado</p>
          : (
            <div className="flex flex-col gap-2">
              {animals.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border)' }} onClick={() => navigate(`/animals/${a.id}`)}>
                  <Avatar species={a.especie} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{a.especie}{a.raca ? ` · ${a.raca}` : ''}</p>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>›</span>
                </div>
              ))}
            </div>
          )
        }
      </Card>

      <Card>
        <p className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{t('tutor.history')}</p>
        {bookings.length === 0
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma reserva</p>
          : bookings.map(b => (
            <div key={b.id} className="flex justify-between items-center py-2 border-b last:border-0 cursor-pointer hover:bg-[var(--bg-hover)] px-2 rounded-lg" style={{ borderColor: 'var(--border)' }} onClick={() => navigate(`/bookings/${b.id}`)}>
              <div>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{fmtDate(b.data_entrada)} → {fmtDate(b.data_saida)}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{b.status_presenca}</p>
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{fmtBRL(b.valor_total)}</p>
            </div>
          ))
        }
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Remover tutor"
        message="Tem certeza? Esta ação é irreversível."
        confirmLabel="Remover"
        loading={deleting}
        onConfirm={() => deleteTutor()}
        onCancel={() => setConfirmDelete(false)}
      />

      <Modal
        open={confirmLgpd}
        onClose={() => setConfirmLgpd(false)}
        title="Excluir todos os dados (LGPD)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLgpd(false)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={deletingAccount}
              disabled={lgpdConfirmText !== 'EXCLUIR'}
              onClick={() => deleteAccount()}
            >
              Excluir permanentemente
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-xl p-3 text-sm" style={{ background: '#FEE2E2', color: '#991B1B' }}>
            <strong>Ação irreversível.</strong> Todos os dados do tutor, animais, reservas e contratos serão excluídos permanentemente em conformidade com a LGPD.
          </div>
          <div>
            <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>Digite <strong>EXCLUIR</strong> para confirmar:</p>
            <Input
              value={lgpdConfirmText}
              onChange={e => setLgpdConfirmText(e.target.value)}
              placeholder="EXCLUIR"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={animalModal}
        onClose={() => setAnimalModal(false)}
        title={t('animal.new')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAnimalModal(false)}>{t('common.cancel')}</Button>
            <Button loading={savingAnimal} onClick={animalForm.handleSubmit(d => addAnimal(d))}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t('animal.fields.name')}
            error={animalForm.formState.errors.nome?.message}
            {...animalForm.register('nome')}
          />
          <Select
            label={t('animal.fields.species')}
            options={[
              { value: 'cachorro', label: '🐶 Cachorro' },
              { value: 'gato', label: '🐱 Gato' },
              { value: 'outro', label: '🐾 Outro' },
            ]}
            value={animalForm.watch('especie')}
            onChange={e => animalForm.setValue('especie', e.target.value as AnimalFields['especie'])}
          />
          <Input
            label={t('animal.fields.breed')}
            {...animalForm.register('raca')}
          />
        </div>
      </Modal>
    </div>
  );
}
