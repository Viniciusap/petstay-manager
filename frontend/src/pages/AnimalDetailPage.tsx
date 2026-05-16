import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import { useToast } from '../contexts/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import FileUpload from '../components/ui/FileUpload';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import type { Animal, Booking } from '../types';

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR'); }
function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

export default function AnimalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Animal>>({});
  const [newVacina, setNewVacina] = useState('');
  const [newAlergia, setNewAlergia] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api.get(`/animals/${id}`).then((r: any) => {
      setAnimal(r.data);
      setBookings(r.data.bookings || []);
      setForm(r.data);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/animals/${id}`, form);
      toast('Salvo!');
      setEditing(false);
      load();
    } catch { toast('Erro', 'error'); }
    finally { setSaving(false); }
  }

  async function addVacina() {
    if (!newVacina.trim() || !animal) return;
    const vacinas = [...(animal.saude?.vacinas || []), newVacina.trim()];
    await api.put(`/animals/${id}`, { saude: { ...animal.saude, vacinas } });
    setNewVacina('');
    load();
  }

  async function removeVacina(v: string) {
    if (!animal) return;
    const vacinas = (animal.saude?.vacinas || []).filter(x => x !== v);
    await api.put(`/animals/${id}`, { saude: { ...animal.saude, vacinas } });
    load();
  }

  async function addAlergia() {
    if (!newAlergia.trim() || !animal) return;
    const alergias = [...(animal.saude?.alergias || []), newAlergia.trim()];
    await api.put(`/animals/${id}`, { saude: { ...animal.saude, alergias } });
    setNewAlergia('');
    load();
  }

  async function removeAlergia(a: string) {
    if (!animal) return;
    const alergias = (animal.saude?.alergias || []).filter(x => x !== a);
    await api.put(`/animals/${id}`, { saude: { ...animal.saude, alergias } });
    load();
  }

  async function uploadFoto(file: File) {
    setUploadingFoto(true);
    const fd = new FormData();
    fd.append('foto', file);
    try {
      await api.post(`/animals/${id}/foto`, fd);
      toast('Foto atualizada!');
      load();
    } catch { toast('Erro no upload', 'error'); }
    finally { setUploadingFoto(false); }
  }

  async function removeFoto() {
    try {
      await api.delete(`/animals/${id}/foto`);
      toast('Foto removida');
      load();
    } catch { toast('Erro', 'error'); }
  }

  async function uploadVacina(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/animals/${id}/vacina`, fd);
      toast('Arquivo enviado!');
      load();
    } catch { toast('Erro no upload', 'error'); }
    finally { setUploading(false); }
  }

  async function removeVacinaFile(path: string) {
    const fname = path.split('/').pop() || '';
    await api.delete(`/animals/${id}/vacina/${fname}`);
    load();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!animal) return <p style={{ color: 'var(--text-muted)' }}>Animal não encontrado.</p>;

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
              ? <Input value={form.nome || ''} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              : <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{animal.nome}</p>
            }
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {animal.especie} · {animal.raca || '—'} · {animal.peso}kg · {animal.idade} anos
            </p>
          </div>
          {editing
            ? <div className="flex gap-2"><Button size="sm" loading={saving} onClick={save}>{t('common.save')}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</Button></div>
            : <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{t('common.edit')}</Button>
                {animal.foto_path && <Button size="sm" variant="ghost" onClick={removeFoto}>🗑</Button>}
              </div>
          }
        </div>
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
              value={form.saude?.observacoes || ''}
              onChange={e => setForm(f => ({ ...f, saude: { ...f.saude!, observacoes: e.target.value } }))}
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
          onFile={uploadVacina}
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
