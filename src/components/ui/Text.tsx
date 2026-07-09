import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { fonts, useTheme, type Theme } from '@/src/theme';
import { formatCents } from '@/src/utils/money';

type Tone =
  | 'text'
  | 'muted'
  | 'income'
  | 'expense'
  | 'success'
  | 'danger'
  | 'warning'
  | 'primary'
  | 'onAccent'
  | 'onAccentMuted';

function toneColor(theme: Theme, tone: Tone): string {
  switch (tone) {
    case 'muted':
      return theme.colors.textMuted;
    case 'income':
      return theme.colors.income;
    case 'expense':
      return theme.colors.expense;
    case 'success':
      return theme.colors.success;
    case 'danger':
      return theme.colors.danger;
    case 'warning':
      return theme.colors.warning;
    case 'primary':
      return theme.colors.primary;
    case 'onAccent':
      return theme.colors.onAccent;
    case 'onAccentMuted':
      return theme.colors.onAccentMuted;
    default:
      return theme.colors.text;
  }
}

type BaseProps = TextProps & {
  tone?: Tone;
  color?: string;
  style?: TextStyle | TextStyle[];
};

/** Titre d'écran — Schibsted Grotesk, chargé de personnalité. */
export function Title({ tone = 'text', color, style, ...rest }: BaseProps) {
  const theme = useTheme();
  return <RNText {...rest} style={[styles.title, { color: color ?? toneColor(theme, tone) }, style]} />;
}

/** Sur-titre discret en capitales espacées (motif « eyebrow » éditorial). */
export function Eyebrow({ tone = 'muted', color, style, ...rest }: BaseProps) {
  const theme = useTheme();
  return <RNText {...rest} style={[styles.eyebrow, { color: color ?? toneColor(theme, tone) }, style]} />;
}

/** Titre de section. */
export function Heading({ tone = 'text', color, style, ...rest }: BaseProps) {
  const theme = useTheme();
  return <RNText {...rest} style={[styles.heading, { color: color ?? toneColor(theme, tone) }, style]} />;
}

type BodyProps = BaseProps & { weight?: 'regular' | 'medium' | 'semibold' | 'bold'; size?: number };

/** Texte courant — Instrument Sans. */
export function Body({ tone = 'text', color, weight = 'regular', size, style, ...rest }: BodyProps) {
  const theme = useTheme();
  const family =
    weight === 'bold'
      ? fonts.bodyBold
      : weight === 'semibold'
        ? fonts.bodySemibold
        : weight === 'medium'
          ? fonts.bodyMedium
          : fonts.body;
  return (
    <RNText
      {...rest}
      style={[
        styles.body,
        { fontFamily: family, color: color ?? toneColor(theme, tone) },
        size != null && { fontSize: size },
        style,
      ]}
    />
  );
}

/** Légende / métadonnée. */
export function Caption({ tone = 'muted', color, style, ...rest }: BaseProps) {
  const theme = useTheme();
  return <RNText {...rest} style={[styles.caption, { color: color ?? toneColor(theme, tone) }, style]} />;
}

type MoneyProps = Omit<BaseProps, 'children'> & {
  cents: number;
  size?: number;
  weight?: 'medium' | 'semibold' | 'bold' | 'xbold';
  signed?: boolean;
};

/**
 * Montant — Schibsted Grotesk en chiffres tabulaires. La signature de l'app :
 * les nombres s'alignent proprement d'une ligne à l'autre.
 */
export function Money({
  cents,
  size = 16,
  weight = 'semibold',
  signed = false,
  tone = 'text',
  color,
  style,
  ...rest
}: MoneyProps) {
  const theme = useTheme();
  const family =
    weight === 'xbold'
      ? fonts.displayXbold
      : weight === 'bold'
        ? fonts.displayBold
        : weight === 'medium'
          ? fonts.display
          : fonts.displaySemibold;
  return (
    <RNText
      {...rest}
      style={[
        styles.money,
        { fontFamily: family, fontSize: size, color: color ?? toneColor(theme, tone) },
        style,
      ]}
    >
      {formatCents(cents, { signed })}
    </RNText>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 27,
    letterSpacing: -0.6,
  },
  eyebrow: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heading: {
    fontFamily: fonts.displaySemibold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
  },
  money: {
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
});
