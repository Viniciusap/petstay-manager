import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useTranslation } from '../contexts/TranslationContext';
import { useToast } from '../contexts/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import Avatar from '../components/ui/Avatar';
import type { Animal, Tutor } from '../types';

export default function AnimalsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: '', especie: 'cachorro', raca: '', tutor_id: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    api.get('/animals').then((r: any) => setAnimals(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    api.get('/tutors').then((r: any) => setTutors(r.data));
  }, []);

  const filtered = animals.filter(a =>
    !search || a.nome.toLowerCase().includes(search.toLowerCase())
  );

  async function save() {
    const e: Record<string, string> = {};
    if (!form.nome) e.nome = t('errors.required');
    if (!form.tutor_id) e.tutor_id = t('errors.required');
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      await api.post('/animals', form);
      toast('Animal cadastrado!');
      setModal(false);
      setForm({ nome: '', especie: 'cachorro', raca: '', tutor_id: '' });
      load();
    } catch { toast('Erro ao cadastrar', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: 'var(--text-primary)' }}>{t('animal.title')}</h1>
        <Button onClick={() => setModal(true)}>{t('animal.new')}</Button>
      </div>

      <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />

      {loading
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
            <Button loading={saving} onClick={save}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label={t('tutor.title')}
            options={tutors.map(t2 => ({ value: t2.id, label: t2.nome }))}
            placeholder="Selecione..."
            value={form.tutor_id}
            onChange={e => { setForm(f => ({ ...f, tutor_id: e.target.value })); setErrors(e2 => ({ ...e2, tutor_id: '' })); }}
            error={errors.tutor_id}
          />
          <Input label={t('animal.fields.name')} value={form.nome} onChange={e => { setForm(f => ({ ...f, nome: e.target.value })); setErrors(e2 => ({ ...e2, nome: '' })); }} error={errors.nome} />
          <Select
            label={t('animal.fields.species')}
            options={[{ value: 'cachorro', label: '🐶 Cachorro' }, { value: 'gato', label: '🐱 Gato' }, { value: 'outro', label: '🐾 Outro' }]}
            value={form.especie}
            onChange={e => setForm(f => ({ ...f, especie: e.target.value }))}
          />
          <Input label={t('animal.fields.breed')} value={form.raca} onChange={e => setForm(f => ({ ...f, raca: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
