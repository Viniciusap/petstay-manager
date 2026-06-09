import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import PhoneInput from '../components/ui/PhoneInput';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { isValidEmail, isValidPhone } from '../lib/masks';
import type { Tutor } from '../types';

const tutorSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  telefone: z.string().min(1, 'Telefone obrigatório').refine(isValidPhone, 'Telefone inválido'),
  email: z.string().optional().refine(v => !v || isValidEmail(v), 'E-mail inválido'),
  endereco: z.string().optional(),
});
type TutorFields = z.infer<typeof tutorSchema>;

export function TutorsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);

  const { data: tutors = [], isLoading } = useQuery({
    queryKey: ['tutors', search],
    queryFn: () => api.get<Tutor[]>(`/tutors${search ? `?q=${search}` : ''}`).then(r => r.data ?? []),
  });

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<TutorFields>({
    resolver: zodResolver(tutorSchema),
  });

  const { mutate: saveTutor, isPending: saving } = useMutation({
    mutationFn: (d: TutorFields) => api.post('/tutors', d),
    onSuccess: () => {
      toast.success('Tutor cadastrado!');
      setModal(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['tutors'] });
    },
    onError: () => toast.error('Erro ao cadastrar'),
  });

  function openModal() {
    reset({ nome: '', telefone: '', email: '', endereco: '' });
    setModal(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('tutor.title')}</h1>
        <Button onClick={openModal}>{t('tutor.new')}</Button>
      </div>

      <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />

      {isLoading
        ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : tutors.length === 0
          ? <EmptyState emoji="👥" title={t('tutor.noTutors')} action={{ label: t('tutor.new'), onClick: openModal }} />
          : (
            <div className="flex flex-col gap-2">
              {tutors.map(t2 => (
                <div
                  key={t2.id}
                  className="flex items-center gap-3 p-4 rounded-2xl border cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                  onClick={() => navigate(`/tutors/${t2.id}`)}
                >
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: 'var(--bg-hover)', color: 'var(--color-primary)' }}>
                    {t2.nome[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{t2.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t2.telefone}{t2.email ? ` · ${t2.email}` : ''}</p>
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
        title={t('tutor.new')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>{t('common.cancel')}</Button>
            <Button loading={saving} onClick={handleSubmit(d => saveTutor(d))}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label={t('tutor.fields.name')} error={errors.nome?.message} {...register('nome')} />
          <Controller
            name="telefone"
            control={control}
            render={({ field }) => (
              <PhoneInput label={t('tutor.fields.phone')} value={field.value} onChange={field.onChange} error={errors.telefone?.message} />
            )}
          />
          <Input label={t('tutor.fields.email')} type="email" inputMode="email" placeholder="nome@email.com" error={errors.email?.message} {...register('email')} />
          <Input label={t('tutor.fields.address')} {...register('endereco')} />
        </div>
      </Modal>
    </div>
  );
}
