import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import type { Animal, Tutor } from '../types';

const animalSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  especie: z.enum(['cachorro', 'gato', 'outro']),
  raca: z.string().optional(),
  tutor_id: z.string().min(1, 'Tutor obrigatório'),
});
type AnimalFields = z.infer<typeof animalSchema>;

export function AnimalsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);

  const { data: animals = [], isLoading } = useQuery({
    queryKey: ['animals'],
    queryFn: () => api.get<Animal[]>('/animals').then(r => r.data ?? []),
  });

  const { data: tutors = [] } = useQuery({
    queryKey: ['tutors', ''],
    queryFn: () => api.get<Tutor[]>('/tutors').then(r => r.data ?? []),
  });

  const filtered = animals.filter(a => !search || a.nome.toLowerCase().includes(search.toLowerCase()));

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AnimalFields>({
    resolver: zodResolver(animalSchema),
    defaultValues: { especie: 'cachorro' },
  });

  const { mutate: saveAnimal, isPending: saving } = useMutation({
    mutationFn: (d: AnimalFields) => api.post('/animals', d),
    onSuccess: () => {
      toast.success('Animal cadastrado!');
      setModal(false);
      reset({ especie: 'cachorro' });
      queryClient.invalidateQueries({ queryKey: ['animals'] });
    },
    onError: () => toast.error('Erro ao cadastrar'),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('animal.title')}</h1>
        <Button onClick={() => setModal(true)}>{t('animal.new')}</Button>
      </div>

      <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />

      {isLoading
        ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : filtered.length === 0
          ? <EmptyState emoji="🐾" title={t('animal.noAnimals')} action={{ label: t('animal.new'), onClick: () => setModal(true) }} />
          : (
            <div className="grid sm:grid-cols-2 gap-3">
              {filtered.map(a => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-4 rounded-2xl border cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                  onClick={() => navigate(`/animals/${a.id}`)}
                >
                  <Avatar species={a.especie} foto={(a as any).foto_path} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{a.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{a.especie}{a.raca ? ` · ${a.raca}` : ''}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {a.peso ? `${a.peso}kg` : ''}{a.idade ? ` · ${a.idade} anos` : ''}
                    </p>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>›</span>
                </div>
              ))}
            </div>
          )
      }

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={t('animal.new')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>{t('common.cancel')}</Button>
            <Button loading={saving} onClick={handleSubmit(d => saveAnimal(d))}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label={t('tutor.title')}
            options={[{ value: '', label: 'Selecione...' }, ...tutors.map(t2 => ({ value: t2.id, label: t2.nome }))]}
            value={watch('tutor_id') ?? ''}
            onChange={e => setValue('tutor_id', e.target.value, { shouldValidate: true })}
            error={errors.tutor_id?.message}
          />
          <Input label={t('animal.fields.name')} error={errors.nome?.message} {...register('nome')} />
          <Select
            label={t('animal.fields.species')}
            options={[{ value: 'cachorro', label: '🐶 Cachorro' }, { value: 'gato', label: '🐱 Gato' }, { value: 'outro', label: '🐾 Outro' }]}
            value={watch('especie')}
            onChange={e => setValue('especie', e.target.value as AnimalFields['especie'])}
          />
          <Input label={t('animal.fields.breed')} {...register('raca')} />
        </div>
      </Modal>
    </div>
  );
}
