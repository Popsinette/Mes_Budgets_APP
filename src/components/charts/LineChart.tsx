import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { fonts, useTheme } from '@/src/theme';
import { formatCents } from '@/src/utils/money';

export type LinePoint = { label: string; cents: number; projected?: boolean };

const HEIGHT = 190;
const PAD = { top: 16, right: 14, bottom: 26, left: 44 };

function compactEuros(cents: number): string {
  const euros = cents / 100;
  if (Math.abs(euros) >= 1000) return `${(euros / 1000).toFixed(Math.abs(euros) >= 10000 ? 0 : 1).replace('.', ',')}k€`;
  return `${Math.round(euros)}€`;
}

/**
 * Courbe d'une seule série (cumul) : trait plein pour le réel, pointillé pour
 * la projection. Toucher un point affiche sa valeur. Axe et grille discrets,
 * chiffres en encre (jamais en couleur de série).
 */
export function LineChart({
  points,
  color,
  projectionColor,
  zeroBased = true,
}: {
  points: LinePoint[];
  color: string;
  projectionColor: string;
  /** false : l'axe se resserre sur les valeurs (évolution lisible même loin de 0). */
  zeroBased?: boolean;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const values = points.map((p) => p.cents);
  const rawMax = zeroBased ? Math.max(0, ...values) : Math.max(...values);
  const rawMin = zeroBased ? Math.min(0, ...values) : Math.min(...values);
  // Hors base zéro : 15 % d'air au-dessus et en dessous de la courbe.
  const pad = zeroBased ? 0 : Math.max((rawMax - rawMin) * 0.15, Math.abs(rawMax) * 0.02, 100);
  const max = rawMax + pad;
  const min = rawMin - pad;
  const span = max - min || 1;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * plotH;
  const ticks = [0, 1, 2, 3].map((i) => min + (span * i) / 3);

  const real = points.map((p, i) => ({ ...p, i })).filter((p) => !p.projected);
  const lastReal = real[real.length - 1];
  const projected = points.map((p, i) => ({ ...p, i })).filter((p) => p.projected);
  const projLine = lastReal ? [lastReal, ...projected] : projected;
  const path = (list: typeof real) => list.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.cents)}`).join(' ');
  const area =
    real.length > 1
      ? [...real.map((p) => `${x(p.i)},${y(p.cents)}`), `${x(lastReal.i)},${y(Math.max(min, 0))}`, `${x(real[0].i)},${y(Math.max(min, 0))}`].join(' ')
      : '';

  const shownLabels = new Set(points.length <= 7 ? points.map((_, i) => i) : [0, lastReal?.i ?? 0, points.length - 1]);

  return (
    <View onLayout={onLayout} style={{ height: HEIGHT }}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {ticks.map((t) => (
            <Line key={t} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={theme.colors.hairline} strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`l${t}`} x={4} y={y(t) + 4} fontSize={10.5} fill={theme.colors.textMuted} fontFamily={fonts.body}>
              {compactEuros(t)}
            </SvgText>
          ))}
          {area ? <Polygon points={area} fill={color} opacity={0.12} /> : null}
          {real.length > 1 ? <Path d={path(real)} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" /> : null}
          {projLine.length > 1 ? (
            <Path d={path(projLine)} stroke={projectionColor} strokeWidth={2} strokeDasharray="6 5" fill="none" />
          ) : null}
          {points.map((p, i) =>
            !p.projected || i === points.length - 1 ? (
              <Circle
                key={`p${i}`}
                cx={x(i)}
                cy={y(p.cents)}
                r={selected === i ? 5.5 : 4}
                fill={p.projected ? projectionColor : color}
                stroke={theme.colors.card}
                strokeWidth={2}
              />
            ) : null,
          )}
          {points.map((p, i) =>
            shownLabels.has(i) ? (
              <SvgText
                key={`x${i}`}
                x={x(i)}
                y={HEIGHT - 6}
                fontSize={10.5}
                fill={theme.colors.textMuted}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                fontFamily={fonts.body}
              >
                {p.label}
              </SvgText>
            ) : null,
          )}
          {selected != null ? (
            <SvgText
              x={Math.min(Math.max(x(selected), PAD.left + 30), width - 40)}
              y={Math.max(12, y(points[selected].cents) - 10)}
              fontSize={12}
              fill={theme.colors.text}
              textAnchor="middle"
              fontFamily={fonts.displaySemibold}
            >
              {`${points[selected].label} · ${formatCents(points[selected].cents)}`}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}
      {/* Zones de toucher plus larges que les points. */}
      {width > 0
        ? points.map((p, i) => (
            <Pressable
              key={`h${i}`}
              onPress={() => setSelected(selected === i ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}${p.projected ? ' (projection)' : ''} : ${formatCents(p.cents)}`}
              style={[styles.hit, { left: x(i) - 16, top: 0 }]}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    position: 'absolute',
    width: 32,
    height: HEIGHT - PAD.bottom,
  },
});
