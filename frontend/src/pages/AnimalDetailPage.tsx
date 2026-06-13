import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api, { resolveFileUrl } from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Card from '../components/ui/Card';
import FileUpload from '../components/ui/FileUpload';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import type { Animal, Booking } from '../types';

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR'); }
function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

const editSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  observacoes: z.string().optional(),
});
type EditFields = z.infer<typeof editSchema>;

interface AnimalWithBookings extends Animal { bookings: Booking[] }

export function AnimalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [newVacina, setNewVacina] = useState('');
  const [newAlergia, setNewAlergia] = useState('');

  const { data: animal, isLoading } = useQuery({
    queryKey: ['animal', id],
    queryFn: () => api.get<AnimalWithBookings>(`/animals/${id}`).then(r => r.data!),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EditFields>({
    resolver: zodResolver(editSchema),
  });

  function startEditing() {
    if (!animal) return;
    reset({ nome: animal.nome, observacoes: animal.saude?.observacoes || '' });
    setEditing(true);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['animal', id] });
  }

  const { mutate: saveAnimal, isPending: saving } = useMutation({
    mutationFn: (d: EditFields) => api.put(`/animals/${id}`, { nome: d.nome, saude: { ...animal?.saude, observacoes: d.observacoes } }),
    onSuccess: () => { toast.success('Salvo!'); setEditing(false); invalidate(); },
    onError: () => toast.error('Erro'),
  });

  const { mutate: uploadFoto, isPending: uploadingFoto } = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('foto', file);
      return api.post(`/animals/${id}/foto`, fd);
    },
    onSuccess: () => { toast.success('Foto atualizada!'); invalidate(); },
    onError: () => toast.error('Erro no upload'),
  });

  const { mutate: removeFoto } = useMutation({
    mutationFn: () => api.delete(`/animals/${id}/foto`),
    onSuccess: () => { toast.success('Foto removida'); invalidate(); },
    onError: () => toast.error('Erro'),
  });

  const { mutate: updateSaude } = useMutation({
    mutationFn: (saude: Animal['saude']) => api.put(`/animals/${id}`, { saude }),
    onSuccess: invalidate,
  });

  const { mutate: uploadVacina, isPending: uploading } = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/animals/${id}/vacina`, fd);
    },
    onSuccess: () => { toast.success('Arquivo enviado!'); invalidate(); },
    onError: () => toast.error('Erro no upload'),
  });

  const { mutate: removeVacinaFile } = useMutation({
    mutationFn: (path: string) => {
      const fname = path.split('/').pop() || '';
      return api.delete(`/animals/${id}/vacina/${fname}`);
    },
    onSuccess: invalidate,
  });

  function addVacina() {
    if (!newVacina.trim() || !animal) return;
    const vacinas = [...(animal.saude?.vacinas || []), newVacina.trim()];
    updateSaude({ ...animal.saude, vacinas });
    setNewVacina('');
  }

  function removeVacina(v: string) {
    if (!animal) return;
    const vacinas = (animal.saude?.vacinas || []).filter(x => x !== v);
    updateSaude({ ...animal.saude, vacinas });
  }

  function addAlergia() {
    if (!newAlergia.trim() || !animal) return;
    const alergias = [...(animal.saude?.alergias || []), newAlergia.trim()];
    updateSaude({ ...animal.saude, alergias });
    setNewAlergia('');
  }

  function removeAlergia(a: string) {
    if (!animal) return;
    const alergias = (animal.saude?.alergias || []).filter(x => x !== a);
    updateSaude({ ...animal.saude, alergias });
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!animal) return <p style={{ color: 'var(--text-muted)' }}>Animal não encontrado.</p>;

  const bookings: Booking[] = (animal as AnimalWithBookings).bookings ?? [];

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/animals')}>← {t('common.back')}</Button>
      </div>

      {/* Header */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => !animal.foto_path && fotoInputRef.current?.click()}>
            <Avatar species={animal.especie as any} size="lg" foto={animal.foto_path} />
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={e => { e.stopPropagation(); fotoInputRef.current?.click(); }}
            >
              {uploadingFoto ? '...' : '📷'}
            </div>
          </div>
          <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFoto(e.target.files[0])} />
          <div className="flex-1">
            {editing
              ? <Input value={animal.nome} readOnly style={{ display: 'none' }} {...register('nome')} />
              : <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{animal.nome}</p>
            }
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {animal.especie} · {animal.raca || '—'} · {animal.peso}kg · {animal.idade} anos
            </p>
          </div>
          {editing
            ? <div className="flex gap-2">
                <Button size="sm" loading={saving} onClick={handleSubmit(d => saveAnimal(d))}>{t('common.save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
              </div>
            : <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={startEditing}>{t('common.edit')}</Button>
                {animal.foto_path && <Button size="sm" variant="ghost" onClick={() => removeFoto()}>🗑</Button>}
              </div>
          }
        </div>
        {editing && (
          <div className="mt-4">
            <Input label="Nome" error={errors.nome?.message} {...register('nome')} />
          </div>
        )}
      </Card>

      {/* Health */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Saúde</p>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{t('animal.fields.vaccines')}</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(animal.saude?.vacinas || []).map(v => (
                <span key={v} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                  {v}
                  <button className="ml-1 opacity-60 hover:opacity-100" onClick={() => removeVacina(v)}>✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Ex: V10" value={newVacina} onChange={e => setNewVacina(e.target.value)} onKeyDown={e => e.key === 'Enter' && addVacina()} />
              <Button size="sm" variant="outline" onClick={addVacina}>+</Button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{t('animal.fields.allergies')}</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(animal.saude?.alergias || []).map(a => (
                <span key={a} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs" style={{ background: '#FEE2E2', color: '#991B1B' }}>
                  {a}
                  <button className="ml-1 opacity-60 hover:opacity-100" onClick={() => removeAlergia(a)}>✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Ex: Frango" value={newAlergia} onChange={e => setNewAlergia(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAlergia()} />
              <Button size="sm" variant="outline" onClick={addAlergia}>+</Button>
            </div>
          </div>

          {editing && (
            <Textarea
              label={t('animal.fields.notes')}
              {...register('observacoes')}
            />
          )}
        </div>
      </Card>

      {/* Vaccination files */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('animal.fields.vaccination_files')}</p>
        <FileUpload
          accept="image/*,application/pdf"
          maxMB={10}
          label={uploading ? 'Enviando...' : 'Arraste ou clique para enviar'}
          onFile={file => uploadVacina(file)}
        />
        {(animal.arquivos_vacinacao || []).length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {animal.arquivos_vacinacao.map(path => {
              const fname = path.split('/').pop() || path;
              return (
                <div key={path} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>📄 {fname}</span>
                  <a href={`/${path}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost">Ver</Button>
                  </a>
                  <Button size="sm" variant="danger" onClick={() => removeVacinaFile(path)}>✕</Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Stay history */}
      <Card>
        <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('animal.history')}</p>
        {bookings.length === 0
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma estadia anterior</p>
          : bookings.map(b => (
            <div key={b.id} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{fmtDate(b.data_entrada)} → {fmtDate(b.data_saida)}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{b.status_presenca}</p>
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{fmtBRL(b.valor_total)}</p>
            </div>
          ))
        }
      </Card>
    </div>
  );
}
