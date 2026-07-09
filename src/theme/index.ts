import { useColorScheme } from 'react-native';

export const palette = {
  violet: '#6C5CE7',
  violetLight: '#8B7CF7',
  mint: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#3B82F6',
  pink: '#EC4899',
  teal: '#14B8A6',
  orange: '#F97316',
  purple: '#8B5CF6',
  slate: '#64748B',
};

export type Theme = {
  dark: boolean;
  colors: {
    background: string;
    card: string;
    cardMuted: string;
    text: string;
    textMuted: string;
    border: string;
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
    /** Texte/icônes posés sur une surface colorée ou un dégradé (cartes héro). */
    onAccent: string;
    onAccentMuted: string;
  };
  /** Dégradés des cartes « héro » — source unique, partagée par tous les écrans. */
  gradients: {
    primary: readonly [string, string];
    success: readonly [string, string];
  };
};

export const lightTheme: Theme = {
  dark: false,
  colors: {
    background: '#F4F4FB',
    card: '#FFFFFF',
    cardMuted: '#F0F0F8',
    text: '#181A2E',
    textMuted: '#6E7191',
    border: '#EAEAF4',
    primary: palette.violet,
    onPrimary: '#FFFFFF',
    primarySoft: '#EEEBFF',
    success: palette.mint,
    successSoft: '#E6F7F0',
    warning: palette.amber,
    warningSoft: '#FEF3E2',
    danger: palette.red,
    dangerSoft: '#FDECEC',
    income: palette.mint,
    expense: palette.red,
    onAccent: '#FFFFFF',
    onAccentMuted: 'rgba(255,255,255,0.82)',
  },
  gradients: {
    primary: ['#6C5CE7', '#9B85F7'],
    success: ['#10B981', '#3ED9A4'],
  },
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    background: '#0E0F1A',
    card: '#1A1C2E',
    cardMuted: '#22243A',
    text: '#F2F3F7',
    textMuted: '#9698B0',
    border: '#282B44',
    primary: palette.violetLight,
    onPrimary: '#FFFFFF',
    primarySoft: '#2A2650',
    success: '#34D399',
    successSoft: '#123B2E',
    warning: '#FBBF24',
    warningSoft: '#3D2E10',
    danger: '#F87171',
    dangerSoft: '#3F1D1D',
    income: '#34D399',
    expense: '#F87171',
    onAccent: '#FFFFFF',
    onAccentMuted: 'rgba(255,255,255,0.82)',
  },
  gradients: {
    primary: ['#4C3FD1', '#7C5CE0'],
    success: ['#0E7A5F', '#17A87F'],
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
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;
