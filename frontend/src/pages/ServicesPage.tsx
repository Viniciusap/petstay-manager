import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import type { Service } from '../types';

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

const serviceSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  nome_en: z.string().optional(),
  valor: z.coerce.number().min(0, 'Valor inválido'),
});
type ServiceFields = z.infer<typeof serviceSchema>;

export function ServicesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Service | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services').then(r => r.data ?? []),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ServiceFields>({
    resolver: zodResolver(serviceSchema),
  });

  const { mutate: saveService, isPending: saving } = useMutation({
    mutationFn: (d: ServiceFields) => {
      const body = { nome: d.nome, nome_en: d.nome_en || d.nome, valor: d.valor };
      return editTarget ? api.put(`/services/${editTarget.id}`, body) : api.post('/services', body);
    },
    onSuccess: () => {
      toast.success(editTarget ? 'Atualizado!' : 'Criado!');
      setModal(false);
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => toast.error('Erro'),
  });

  const { mutate: deleteService, isPending: deleting } = useMutation({
    mutationFn: () => api.delete(`/services/${deleteTarget?.id}`),
    onSuccess: () => {
      toast.success('Removido!');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => toast.error('Erro'),
  });

  function openNew() {
    reset({ nome: '', nome_en: '', valor: 0 });
    setEditTarget(null);
    setModal(true);
  }

  function openEdit(s: Service) {
    reset({ nome: s.nome, nome_en: s.nome_en, valor: s.valor });
    setEditTarget(s);
    setModal(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('service.title')}</h1>
        <Button onClick={openNew}>{t('service.new')}</Button>
      </div>

      {isLoading
        ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : services.length === 0
          ? <EmptyState emoji="✂️" title={t('service.noServices')} action={{ label: t('service.new'), onClick: openNew }} />
          : (
            <div className="flex flex-col gap-2">
              {services.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-4 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{s.nome}</p>
                    {s.nome_en && s.nome_en !== s.nome && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.nome_en}</p>}
                  </div>
                  <p className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{fmtBRL(s.valor)}</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>{t('common.edit')}</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(s)}>✕</Button>
                  </div>
                </div>
              ))}
            </div>
          )
      }

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editTarget ? t('common.edit') : t('service.new')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>{t('common.cancel')}</Button>
            <Button loading={saving} onClick={handleSubmit(d => saveService(d))}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label={t('service.fields.name')} error={errors.nome?.message} {...register('nome')} />
          <Input label={t('service.fields.name_en')} {...register('nome_en')} />
          <Input label={t('service.fields.price')} type="number" min="0" step="0.01" error={errors.valor?.message} {...register('valor')} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remover serviço"
        message={`Remover "${deleteTarget?.nome}"?`}
        loading={deleting}
        onConfirm={() => deleteService()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
