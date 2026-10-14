import { useColorScheme } from 'react-native';
import { useThemePref } from '@/src/store/themePref';

/**
 * Typographie appariée Schibsted Grotesk (titres + montants) /
 * Instrument Sans (corps).
 */

export const palette = {
  terracotta: '#A8654A', // action principale (onglet actif, boutons)
  slate: '#5E6B66', // vert ardoise (FAB, actions secondaires)
  navy: '#2E3B4E', // bleu nuit (« à venir »)
  rose: '#D49A86', // vieux rose (« réglé »)
  gold: '#C9A45C', // or doux
  sage: '#8A9682',
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
    /** Séparateur très discret (filets entre les lignes). */
    hairline: string;
    /** Couleur d'action : terracotta (onglet actif, boutons principaux). */
    primary: string;
    onPrimary: string;
    primarySoft: string;
    /** Vert ardoise : FAB, actions secondaires pleines. */
    secondary: string;
    /** Bleu nuit : ce qui reste « à venir / à débiter ». */
    navy: string;
    /** Vieux rose : ce qui est « réglé / crédité ». */
    rose: string;
    gold: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    income: string;
    expense: string;
    /** Texte/icônes posés sur une surface pleine (boutons, pastilles). */
    onAccent: string;
    onAccentMuted: string;
  };
};

/**
 * Direction « Budgetiz » : fond gris très clair, cartes blanches arrondies,
 * terracotta pour l'action, vert ardoise, bleu nuit et vieux rose pour les
 * pastilles d'état. Thème sombre : brun-gris chaud, jamais de noir pur.
 */
export const lightTheme: Theme = {
  dark: false,
  colors: {
    background: '#F6F5F2',
    card: '#FFFFFF',
    cardMuted: '#EFEDE8',
    text: '#26282B',
    textMuted: '#85827C',
    border: '#E7E4DE',
    hairline: '#EDEBE6',
    primary: palette.terracotta,
    onPrimary: '#FFFFFF',
    primarySoft: '#F3E6E0',
    secondary: palette.slate,
    navy: palette.navy,
    rose: palette.rose,
    gold: palette.gold,
    success: '#5F8B6D',
    successSoft: '#E4EEE6',
    warning: '#B7791F',
    warningSoft: '#F3EAD7',
    danger: '#B4523A',
    dangerSoft: '#F5E1DA',
    income: '#4F7A61',
    expense: palette.terracotta,
    onAccent: '#FFFFFF',
    onAccentMuted: 'rgba(255,255,255,0.8)',
  },
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    background: '#1E1C1A',
    card: '#2A2724',
    cardMuted: '#36322E',
    text: '#F1EEE9',
    textMuted: '#A7A199',
    border: '#3A3632',
    hairline: '#332F2B',
    primary: '#C9805F',
    onPrimary: '#1E1C1A',
    primarySoft: '#43302A',
    secondary: '#8A9A93',
    navy: '#8FA3BF',
    rose: '#DDA996',
    gold: '#D6B474',
    success: '#7FAE8D',
    successSoft: '#26352B',
    warning: '#D3A24C',
    warningSoft: '#3B2F17',
    danger: '#D98A72',
    dangerSoft: '#41291F',
    income: '#8FBE9D',
    expense: '#D8977A',
    onAccent: '#1E1C1A',
    onAccentMuted: 'rgba(30,28,26,0.75)',
  },
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const pref = useThemePref((s) => s.pref);
  const effective = pref === 'auto' ? scheme : pref;
  return effective === 'dark' ? darkTheme : lightTheme;
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
