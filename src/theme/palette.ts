// Sans dépendance à react-native : importable par les repositories (et les tests).

/**
 * Palette des pastilles de catégories / comptes (choix utilisateur).
 * Teintes sourdes accordées au papier et à l'encre, mais **validées** :
 * lisibles sur fond clair et sombre (contraste ≥ 3:1), au-dessus du seuil
 * de chroma (aucune ne « se lit grise »), et distinguables entre voisines
 * pour les daltoniens (pire ΔE adjacent 26,8). L'ordre est fixe : il sert
 * de séquence par défaut — ne pas le réordonner.
 */
export const categoryPalette = [
  '#C97558', // terracotta doux
  '#2AA0B0', // sarcelle douce
  '#B8892F', // ocre doux
  '#837DC1', // indigo doux
  '#89A048', // olive douce
  '#C372A8', // orchidée douce
  '#4FA173', // sauge douce
  '#5E97D1', // océan doux
  '#BD7745', // caramel doux
  '#9E72BE', // violet doux
  '#789F4C', // prairie douce
  '#CB778D', // framboise douce
] as const;
