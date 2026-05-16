import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { resolveFileUrl } from '../lib/api';
import Spinner from '../components/ui/Spinner';

interface GaleriaData {
  fotos: { path: string; uploaded_at: string }[];
  animal: string;
  especie: string;
  tutor: string;
  hotel: string;
  logo: string | null;
  cor_primaria: string;
  data_entrada: string;
  data_saida: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function GaleriaPage() {
  const [params] = useSearchParams();
  const token = params.get('t');
  const [data, setData] = useState<GaleriaData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    if (!token) { setError('Link inválido'); setLoading(false); return; }
    api.get(`/galeria/${token}`)
      .then((res: any) => setData(res.data))
      .catch(() => setError('Galeria não encontrada ou link inválido'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f0f' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0f0f0f' }}>
        <div className="text-center text-white space-y-3">
          <div className="text-5xl">🐾</div>
          <p className="text-lg font-semibold">{error || 'Galeria não encontrada'}</p>
        </div>
      </div>
    );
  }

  const primaryColor = data.cor_primaria || '#F97316';
  const fotos = data.fotos.map(f => resolveFileUrl(f.path)).filter(Boolean) as string[];

  function prev() { setLightbox(l => l !== null ? (l - 1 + fotos.length) % fotos.length : null); }
  function next() { setLightbox(l => l !== null ? (l + 1) % fotos.length : null); }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f0f', color: '#fff' }}>
      {/* Header */}
      <div className="px-5 pt-8 pb-6 text-center space-y-3">
        {data.logo && (
          <img src={resolveFileUrl(data.logo) ?? ''} alt="Logo" className="h-12 w-12 rounded-xl object-contain mx-auto" />
        )}
        <p className="text-sm font-medium" style={{ color: primaryColor }}>{data.hotel}</p>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {data.animal} 🐾
          </h1>
          <p className="text-sm mt-1" style={{ color: '#aaa' }}>
            {fmtDate(data.data_entrada)} → {fmtDate(data.data_saida)}
          </p>
        </div>
        <div
          className="inline-block px-4 py-2 rounded-full text-sm font-medium"
          style={{ background: primaryColor + '22', color: primaryColor, border: `1px solid ${primaryColor}44` }}
        >
          Um presente de {data.hotel} para {data.tutor}
        </div>
      </div>

      {/* Grid */}
      <div className="px-3 pb-12">
        <p className="text-xs text-center mb-4" style={{ color: '#666' }}>
          {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'} · Toque para ampliar
        </p>
        <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
          {fotos.map((url, i) => (
            <button
              key={i}
              onClick={() => setLightbox(i)}
              className="aspect-square overflow-hidden rounded-2xl focus:outline-none"
              style={{ border: `2px solid #222` }}
            >
              <img
                src={url}
                alt={`Foto ${i + 1}`}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 text-xs" style={{ color: '#444' }}>
        Feito com carinho por {data.hotel} · PetStay Manager
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.95)' }}
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl"
            style={{ background: '#ffffff22' }}
            onClick={e => { e.stopPropagation(); prev(); }}
          >‹</button>

          <img
            src={fotos[lightbox]}
            alt={`Foto ${lightbox + 1}`}
            className="max-h-screen max-w-full object-contain px-14"
            onClick={e => e.stopPropagation()}
          />

          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl"
            style={{ background: '#ffffff22' }}
            onClick={e => { e.stopPropagation(); next(); }}
          >›</button>

          <a
            href={fotos[lightbox]}
            download={`foto_${lightbox + 1}.jpg`}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full text-sm font-medium"
            style={{ background: primaryColor, color: '#fff' }}
            onClick={e => e.stopPropagation()}
          >
            ⬇ Baixar foto
          </a>

          <button
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white"
            style={{ background: '#ffffff22' }}
            onClick={() => setLightbox(null)}
          >✕</button>

          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-sm" style={{ color: '#aaa' }}>
            {lightbox + 1} / {fotos.length}
          </p>
        </div>
      )}
    </div>
  );
}
