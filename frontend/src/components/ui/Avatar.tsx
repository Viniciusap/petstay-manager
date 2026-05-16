import { resolveFileUrl } from '../../lib/api';

type Species = 'cachorro' | 'gato' | 'outro';

const emojis: Record<Species, string> = {
  cachorro: '🐶',
  gato: '🐱',
  outro: '🐾',
};

interface Props {
  species?: Species;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  foto?: string | null;
}

const sizes = { sm: 'h-8 w-8 text-lg', md: 'h-12 w-12 text-2xl', lg: 'h-16 w-16 text-3xl' };

export default function Avatar({ species = 'outro', size = 'md', foto }: Props) {
  const fotoUrl = foto ? resolveFileUrl(foto) : null;

  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt="Foto"
        className={`rounded-full object-cover flex-shrink-0 ${sizes[size]}`}
        style={{ border: '2px solid var(--border)' }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full flex-shrink-0 ${sizes[size]}`}
      style={{ background: 'var(--bg-hover)' }}
    >
      {emojis[species] || '🐾'}
    </div>
  );
}
