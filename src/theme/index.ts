import { useColorScheme } from 'react-native';

/**
 * Direction « Précision tranquille », déclinaison chaleureuse : fond crème,
 * texte et actions en brun profond, accents fonctionnels sauge (positif) et
 * terracotta (dépense). Le thème sombre est un brun chaud — jamais de noir.
 * Typographie appariée Schibsted Grotesk (titres + montants) /
 * Instrument Sans (corps).
 */

export const palette = {
  ink: '#3A2E21', // brun profond — la couleur d'action
  green: '#5F8B6D', // sauge
  greenDark: '#26352B',
  amber: '#B7791F',
  brick: '#B4674E', // terracotta douce
  slate: '#84776A',
};

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

/** Familles chargées au démarrage (voir app/_layout.tsx). */
export const fonts = {
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemibold: 'InstrumentSans_600SemiBold',
  bodyBold: 'InstrumentSans_700Bold',
  display: 'SchibstedGrotesk_500Medium',
  displaySemibold: 'SchibstedGrotesk_600SemiBold',
  displayBold: 'SchibstedGrotesk_700Bold',
  displayXbold: 'SchibstedGrotesk_800ExtraBold',
} as const;

export type Theme = {
  dark: boolean;
  colors: {
    background: string;
    card: string;
    cardMuted: string;
    text: string;
    textMuted: string;
    border: string;
    /** Séparateur très discret (filets de « grand livre »). */
    hairline: string;
    primary: string;
    onPrimary: string;
    primarySoft: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    income: string;
    expense: string;
    /** Texte/icônes posés sur une surface encre (boutons, pastilles pleines). */
    onAccent: string;
    onAccentMuted: string;
  };
};

export const lightTheme: Theme = {
  dark: false,
  colors: {
    background: '#F6F0E6', // crème
    card: '#FDFAF4', // ivoire
    cardMuted: '#EFE7D9',
    text: '#33291E', // brun foncé
    textMuted: '#84776A',
    border: '#E6DCCB',
    hairline: '#ECE3D4',
    primary: '#4A3B2C', // brun — couleur d'action
    onPrimary: '#FBF6EC',
    primarySoft: '#ECE3D4',
    success: palette.green, // sauge
    successSoft: '#E4EEE6',
    warning: palette.amber,
    warningSoft: '#F3EAD7',
    danger: palette.brick, // terracotta douce
    dangerSoft: '#F3E3DC',
    income: palette.green,
    expense: palette.brick,
    onAccent: '#FBF6EC',
    onAccentMuted: 'rgba(251,246,236,0.78)',
  },
};

// Thème sombre : brun chaud profond (cacao), jamais de noir.
export const darkTheme: Theme = {
  dark: true,
  colors: {
    background: '#221B14',
    card: '#2B2219',
    cardMuted: '#362B20',
    text: '#F2EADD', // crème
    textMuted: '#A99C8B',
    border: '#3D3225',
    hairline: '#352B1F',
    primary: '#EFE5D2', // crème — couleur d'action sur fond cacao
    onPrimary: '#2B2219',
    primarySoft: '#3D3225',
    success: '#7FAE8D', // sauge claire
    successSoft: '#26352B',
    warning: '#D3A24C',
    warningSoft: '#3B2F17',
    danger: '#D08A72', // terracotta claire
    dangerSoft: '#41291F',
    income: '#7FAE8D',
    expense: '#D08A72',
    onAccent: '#2B2219',
    onAccentMuted: 'rgba(43,34,25,0.72)',
  },
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 36,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
} as const;
