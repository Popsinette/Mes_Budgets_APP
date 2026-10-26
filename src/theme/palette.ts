// Sans dépendance à react-native : importable par les repositories (et les tests).

/**
 * Palette des pastilles d'enveloppes / cagnottes (choix utilisateur) — pastels
 * frais (lavande, sauge, menthe, rose…), aucune teinte brune.
 *
 * **Validée** avec `scripts/validate_palette.js` du skill dataviz, dans les
 * deux modes : bande de luminosité, chroma ≥ 0,10, voisines distinguables
 * pour les daltoniens (pire ΔE adjacent 9,1 clair / 10,7 sombre, cible ≥ 8)
 * et en vision normale (≥ 15,9). En clair, huit teintes sont sous 3:1 sur le
 * blanc : elles portent toujours leur nom à côté (étiquettes / légendes avec
 * valeurs) — ne jamais les utiliser seules pour une donnée.
 *
 * L'ordre est fixe (c'est lui qui garantit l'écart entre voisines) : ne pas
 * le réordonner ni ajouter de teinte sans revalider.
 */
export const categoryPalette = [
  '#8B7FE0', // lavande
  '#5FAE7E', // sauge
  '#A577D3', // violette
  '#3FAE97', // menthe
  '#D6A021', // miel
  '#C9629A', // framboise
  '#7BB15A', // pousse
  '#2FA9C4', // lagon
  '#F07F7F', // corail
  '#4C9BE0', // bleuet
  '#E57FA3', // pivoine
] as const;

/**
 * Mêmes teintes, pas « sombre » (luminosité ramenée dans la bande du mode
 * sombre, validée sur la carte sombre #23232F). La couleur stockée en base est
 * toujours la teinte claire ; `seriesColor` donne la bonne selon le mode.
 */
export const categoryPaletteDark = [
  '#8B7FE0',
  '#55A475',
  '#A577D3',
  '#34A68F',
  '#BB8600',
  '#C9629A',
  '#6DA24B',
  '#22A1BC',
  '#D86A6B',
  '#4796DB',
  '#CF6C90',
] as const;

const DARK_BY_LIGHT: Record<string, string> = Object.fromEntries(
  categoryPalette.map((c, i) => [c, categoryPaletteDark[i]]),
);

/** Couleur d'une enveloppe / cagnotte pour le mode courant (inchangée si hors palette). */
export function seriesColor(hex: string, dark: boolean): string {
  return dark ? (DARK_BY_LIGHT[hex.toUpperCase()] ?? hex) : hex;
}

/** Ancienne palette (« teintes sourdes », jusqu'à V17) : convertie par la migration V18. */
export const LEGACY_PALETTE = [
  '#C97558',
  '#2AA0B0',
  '#B8892F',
  '#837DC1',
  '#89A048',
  '#C372A8',
  '#4FA173',
  '#5E97D1',
  '#BD7745',
  '#9E72BE',
  '#789F4C',
  '#CB778D',
] as const;
