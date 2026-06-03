// src/features/immobilier/MemberAvatars.jsx
// Pile d'avatars chevauches des membres d'un tableau.
// Delegue le rendu de chaque pastille au composant <Avatar> commun, qui
// gere photo de profil OU initiales sur palette deterministe.

import Avatar from '../../components/common/Avatar';

export default function MemberAvatars({ members, max = 4 }) {
  if (!members || members.length === 0) return null;

  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;

  return (
    <div className="inline-flex items-center" aria-label={`${members.length} membres`}>
      {visible.map((m, idx) => {
        const profile = m.profile;
        if (!profile) return null;
        const fullName = `${profile.prenom || ''} ${profile.nom || ''}`.trim();
        return (
          <Avatar
            key={m.user_id}
            profile={profile}
            size={28}
            alt={fullName}
            className={`border-2 border-white ${idx > 0 ? '-ml-2' : ''}`}
          />
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
