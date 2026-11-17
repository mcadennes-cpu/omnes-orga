// src/lib/identifiant.js
//
// Identifiant unique (UUID v4) fabrique dans le navigateur.
//
// Pourquoi pas directement crypto.randomUUID() : Safari ne la fournit que
// dans un « contexte securise » (https:// ou localhost). Sur l'adresse du
// Mac en reseau local (http://192.168.x.x, essais sur telephone), elle est
// absente et l'appel plante. crypto.getRandomValues(), elle, existe partout :
// on s'en sert pour fabriquer le meme format d'identifiant (constate le
// 17/11/2026 pendant l'essai iPhone du module Contrats).

export function nouvelIdentifiant() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const o = crypto.getRandomValues(new Uint8Array(16))
  o[6] = (o[6] & 0x0f) | 0x40 // version 4
  o[8] = (o[8] & 0x3f) | 0x80 // variante RFC 4122
  const h = Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
