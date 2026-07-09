import { useColorScheme } from 'react-native';

/**
 * Direction « Précision tranquille » : palette neutre encre, un seul registre
 * d'accent fonctionnel (vert = positif, brique = dépense), l'encre comme couleur
 * d'action. Typographie appariée Schibsted Grotesk (titres + montants) /
 * Instrument Sans (corps).
 */

export const palette = {
  ink: '#191A1E',
  green: '#1C8A5B',
  greenDark: '#0F1E1A',
  amber: '#B7791F',
  brick: '#BE4A3A',
  slate: '#797A80',
};

/**
 * Palette des pastilles de catégories / comptes (choix utilisateur). Teintes
 * sourdes et désaturées, accordées au fond papier et à l'encre — plus de
 * couleurs criardes. L'ordre sert de séquence par défaut.
 */
export const categoryPalette = [
  '#C56A4E', // terracotta
  '#C79A3E', // ocre
  '#8B9150', // olive
  '#5F9070', // sauge
  '#3F9195', // sarcelle
  '#5580A6', // océan
  '#6E6FA6', // indigo
  '#7A6E9C', // lavande
  '#9A6494', // prune
  '#C57487', // rose
  '#B5695A', // argile
  '#857F76', // pierre
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
    background: '#F6F6F3',
    card: '#FFFFFF',
    cardMuted: '#F1F1EC',
    text: '#191A1E',
    textMuted: '#797A80',
    border: '#E7E7E1',
    hairline: '#ECECE6',
    primary: '#191A1E',
    onPrimary: '#FFFFFF',
    primarySoft: '#ECECE6',
    success: palette.green,
    successSoft: '#E4F2EA',
    warning: palette.amber,
    warningSoft: '#F6EEDD',
    danger: palette.brick,
    dangerSoft: '#F6E7E3',
    income: palette.green,
    expense: palette.brick,
    onAccent: '#FFFFFF',
    onAccentMuted: 'rgba(255,255,255,0.78)',
  },
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    background: '#0F0F11',
    card: '#17181B',
    cardMuted: '#212227',
    text: '#F3F3F0',
    textMuted: '#9B9CA1',
    border: '#26272B',
    hairline: '#222327',
    primary: '#F3F3F0',
    onPrimary: '#17181B',
    primarySoft: '#26272B',
    success: '#34B87E',
    successSoft: '#123227',
    warning: '#D8A544',
    warningSoft: '#33280F',
    danger: '#E0685A',
    dangerSoft: '#3A211D',
    income: '#34B87E',
    expense: '#E0685A',
    onAccent: '#17181B',
    onAccentMuted: 'rgba(23,24,27,0.72)',
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
