// src/features/immobilier/MemberAvatars.jsx
// Pile d'avatars chevauches des membres d'un tableau.
// Utilise le helper global getAvatarPalette pour que les couleurs soient
// coherentes avec le Trombinoscope et les autres modules (un meme medecin
// garde sa couleur partout dans l'app).

import { getAvatarPalette } from '../../lib/avatarColor';
import { initials } from '../../lib/profileFormat';

export default function MemberAvatars({ members, max = 4 }) {
  if (!members || members.length === 0) return null;

  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;

  return (
    <div className="inline-flex items-center" aria-label={`${members.length} membres`}>
      {visible.map((m, idx) => {
        const profile = m.profile;
        if (!profile) return null;
        const palette = getAvatarPalette(`${profile.prenom} ${profile.nom}`);
        return (
          <span
            key={m.user_id}
            className={`w-7 h-7 rounded-full ${palette.bg} ${palette.text}
                        border-2 border-white flex items-center justify-center
                        text-[11px] font-semibold ${idx > 0 ? '-ml-2' : ''}`}
            title={`${profile.prenom || ''} ${profile.nom || ''}`.trim()}
          >
            {initials(profile)}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          className="w-7 h-7 rounded-full bg-fond text-muted
                     border-2 border-white flex items-center justify-center
                     text-[11px] font-semibold -ml-2"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
