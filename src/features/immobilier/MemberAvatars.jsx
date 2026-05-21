// src/features/immobilier/MemberAvatars.jsx
// Pile d'avatars chevauches dans le header du tableau.
// - Affiche jusqu'a 4 avatars, puis +N
// - Couleur de fond derivee du nom (meme hash que MedecinCard, cf. doc 7C)

import { initials } from '../../lib/profileFormat';

const AVATAR_COLORS = ['marine', 'canard', 'ocre', 'olive', 'brique', 'fuchsia'];

const AVATAR_BG_CLASSES = {
  marine:  'bg-marine',
  canard:  'bg-canard',
  ocre:    'bg-ocre',
  olive:   'bg-olive',
  brique:  'bg-brique',
  fuchsia: 'bg-fuchsia',
};

function pickColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function MemberAvatars({ members, max = 4 }) {
  if (!members || members.length === 0) return null;

  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;

  return (
    <div className="flex items-center -space-x-2" aria-label={`${members.length} membres`}>
      {visible.map((m) => {
        const profile = m.profile;
        if (!profile) return null;
        const fullName = `${profile.prenom || ''} ${profile.nom || ''}`.trim();
        const color = pickColor(fullName || profile.id);
        const bg = AVATAR_BG_CLASSES[color] || AVATAR_BG_CLASSES.canard;
        return (
          <div
            key={m.user_id}
            className={`w-8 h-8 rounded-full ${bg} text-white text-caption
                        flex items-center justify-center ring-2 ring-carte`}
            title={fullName}
          >
            {initials(profile)}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className="w-8 h-8 rounded-full bg-fond text-muted text-caption
                     flex items-center justify-center ring-2 ring-carte"
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
