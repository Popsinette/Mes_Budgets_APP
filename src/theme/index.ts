import { useColorScheme } from 'react-native';
import { useThemePref } from '@/src/store/themePref';

/**
 * Typographie appariée Schibsted Grotesk (titres + montants) /
 * Instrument Sans (corps).
 */

export const palette = {
  lavender: '#6E62D0', // action principale (onglet actif, boutons)
  mint: '#3F8F83', // menthe profonde (bouton +, coches faites)
  indigo: '#3D3F72', // indigo (« à venir »)
  blush: '#D97A9E', // rose poudré (« réglé »)
  honey: '#D9A33A', // miel doux
};

import { seriesColor } from './palette';

export { categoryPalette, categoryPaletteDark, seriesColor } from './palette';

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
  /** Couleur d'une enveloppe / cagnotte (stockée en teinte claire) pour ce mode. */
  tint: (hex: string) => string;
};

/**
 * Direction « pastel » : fond lilas très clair, cartes blanches sans bord
 * avec une ombre lavande à peine visible, lavande pour l'action, menthe,
 * indigo et rose poudré pour les pastilles d'état (toujours en teinte
 * douce + icône colorée). Thème sombre : nuit indigo, jamais de brun.
 * Contrastes vérifiés : texte ≥ 4,5:1 sur carte et fond, blanc sur lavande 4,9:1.
 */
export const lightTheme: Theme = {
  dark: false,
  colors: {
    background: '#F6F5FB',
    card: '#FFFFFF',
    cardMuted: '#F0EEF8',
    text: '#24233A',
    textMuted: '#706D88',
    border: '#E9E6F3',
    hairline: '#F0EEF6',
    primary: palette.lavender,
    onPrimary: '#FFFFFF',
    primarySoft: '#ECE9FB',
    secondary: palette.mint,
    navy: palette.indigo,
    rose: palette.blush,
    gold: palette.honey,
    success: '#2A8460',
    successSoft: '#E1F3EA',
    warning: '#9A6A00',
    warningSoft: '#FBF1DA',
    danger: '#C2415F',
    dangerSoft: '#FCE6EC',
    income: '#2A8460',
    expense: '#B0466F',
    onAccent: '#FFFFFF',
    onAccentMuted: 'rgba(255,255,255,0.82)',
  },
  tint: (hex) => seriesColor(hex, false),
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    background: '#16161F',
    card: '#222230',
    cardMuted: '#2C2C3D',
    text: '#EEEDF7',
    textMuted: '#A4A2BA',
    border: '#30304A',
    hairline: '#2B2B3C',
    primary: '#A99EF0',
    onPrimary: '#16161F',
    primarySoft: '#2F2B4D',
    secondary: '#7CCBBD',
    navy: '#A9B0EB',
    rose: '#F0A9C3',
    gold: '#EBC266',
    success: '#79CBA4',
    successSoft: '#1E3830',
    warning: '#E6B65A',
    warningSoft: '#3A311C',
    danger: '#F08AA0',
    dangerSoft: '#42222F',
    income: '#79CBA4',
    expense: '#F0A0BE',
    onAccent: '#16161F',
    onAccentMuted: 'rgba(22,22,31,0.75)',
  },
  tint: (hex) => seriesColor(hex, true),
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
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
} as const;
