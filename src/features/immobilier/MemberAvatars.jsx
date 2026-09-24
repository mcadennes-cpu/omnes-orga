// src/features/immobilier/MemberAvatars.jsx
// Pile d'avatars chevauches des membres d'un tableau.
// Delegue le rendu de chaque pastille au composant <Avatar> commun, qui
// gere photo de profil OU initiales sur palette deterministe.
//
// Si `onClick` est fourni, la pile devient tappable et ouvre la feuille des
// participants (MembersSheet) : le "+N" masque les membres au-dela du 4e, il
// faut un moyen de voir la liste complete. Meme contrat que la pile de
// Discussion.

import Avatar from '../../components/common/Avatar';

export default function MemberAvatars({ members, max = 4, onClick, ariaLabel }) {
  if (!members || members.length === 0) return null;

  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;

  // Wrapper bouton uniquement si tappable : sinon on garde un <div> neutre.
  const Wrapper = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? {
        type: 'button',
        onClick,
        'aria-label': ariaLabel || 'Voir les participants',
      }
    : { 'aria-label': `${members.length} membres` }

  return (
    <Wrapper
      {...wrapperProps}
      className={`inline-flex items-center ${
        onClick ? 'active:opacity-80 transition-opacity' : ''
      }`}
    >
      {visible.map((m, idx) => {
        const profile = m.profile;
        if (!profile) return null;
        const fullName = `${profile.prenom || ''} ${profile.nom || ''}`.trim();
        return (
          <Avatar
            key={m.user_id}
            profile={profile}
            size={28}
            alt={onClick ? '' : fullName}
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
    </Wrapper>
  );
}
