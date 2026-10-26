import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fonts, spacing, useTheme } from '@/src/theme';
import { formatCents } from '@/src/utils/money';
import { Body, Caption, Money } from '../ui/Text';

export type ColumnSegment = { key: string; label: string; cents: number; color: string };
export type Column = {
  key: string;
  label: string;
  /** Empilés de bas en haut, dans l'ordre fixe des familles. */
  segments: ColumnSegment[];
  /** Repère sur le même axe (revenus du mois, budget d'une semaine…). */
  reference?: number;
};

const HEIGHT = 170;
const PAD = { top: 12, right: 6, bottom: 24, left: 40 };

function compactEuros(cents: number): string {
  const euros = cents / 100;
  if (Math.abs(euros) >= 1000) return `${(euros / 1000).toFixed(Math.abs(euros) >= 10000 ? 0 : 1).replace('.', ',')}k€`;
  return `${Math.round(euros)}€`;
}

/** Haut de colonne arrondi (4 px), bas posé sur la base. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/**
 * Colonnes (empilées ou simples) sur un seul axe en euros. Segments séparés
 * de 2 px, haut arrondi, grille en filets discrets, chiffres en encre. Un
 * repère optionnel (trait) par colonne, sur le même axe. Toucher une colonne
 * affiche son détail chiffré sous le graphique (lisible sans la couleur).
 */
export function ColumnChart({
  columns,
  referenceLabel,
  emptyLabel = 'Pas encore de données.',
}: {
  columns: Column[];
  referenceLabel?: string;
  emptyLabel?: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const totals = columns.map((c) => c.segments.reduce((s, x) => s + Math.max(0, x.cents), 0));
  const max = Math.max(1, ...totals, ...columns.map((c) => c.reference ?? 0));
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, columns.length);
  const barW = Math.min(30, slot * 0.56);
  const y = (v: number) => PAD.top + (1 - v / max) * plotH;
  const ticks = [0, 0.5, 1].map((r) => r * max);
  const empty = totals.every((t) => t === 0) && columns.every((c) => !c.reference);
  const sel = selected != null ? columns[selected] : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View onLayout={onLayout} style={{ height: HEIGHT }}>
        {width > 0 && !empty ? (
          <Svg width={width} height={HEIGHT}>
            {ticks.map((t) => (
              <Line key={t} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={theme.colors.hairline} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText key={`t${t}`} x={2} y={y(t) + 4} fontSize={10.5} fill={theme.colors.textMuted} fontFamily={fonts.body}>
                {compactEuros(t)}
              </SvgText>
            ))}
            {columns.map((col, i) => {
              const x = PAD.left + slot * i + (slot - barW) / 2;
              const dim = selected != null && selected !== i ? 0.35 : 1;
              let base = 0;
              const visible = col.segments.filter((s) => s.cents > 0);
              return (
                <G key={col.key}>
                  {visible.map((seg, k) => {
                    const top = base + seg.cents;
                    const y1 = y(top);
                    // 2 px de fond entre deux segments empilés.
                    const h = Math.max(0, y(base) - y1 - (k > 0 ? 2 : 0));
                    base = top;
                    const fill = theme.tint(seg.color);
                    return k === visible.length - 1 ? (
                      <Path key={seg.key} d={topRounded(x, y1, barW, h, 4)} fill={fill} opacity={dim} />
                    ) : (
                      <Rect key={seg.key} x={x} y={y1} width={barW} height={h} fill={fill} opacity={dim} />
                    );
                  })}
                  {col.reference ? (
                    <Line
                      x1={x - 4}
                      x2={x + barW + 4}
                      y1={y(col.reference)}
                      y2={y(col.reference)}
                      stroke={theme.colors.text}
                      strokeWidth={2}
                      strokeLinecap="round"
                      opacity={dim}
                    />
                  ) : null}
                  <SvgText
                    x={x + barW / 2}
                    y={HEIGHT - 6}
                    fontSize={10.5}
                    fill={selected === i ? theme.colors.text : theme.colors.textMuted}
                    textAnchor="middle"
                    fontFamily={selected === i ? fonts.bodySemibold : fonts.body}
                  >
                    {col.label}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
        {width > 0 && empty ? (
          <View style={styles.empty}>
            <Caption>{emptyLabel}</Caption>
          </View>
        ) : null}
        {width > 0 && !empty
          ? columns.map((col, i) => (
              <Pressable
                key={`h${col.key}`}
                onPress={() => setSelected(selected === i ? null : i)}
                accessibilityRole="button"
                accessibilityLabel={`${col.label} : ${formatCents(totals[i])}${
                  col.reference ? `, ${referenceLabel ?? 'repère'} ${formatCents(col.reference)}` : ''
                }`}
                style={[styles.hit, { left: PAD.left + slot * i, width: slot }]}
              />
            ))
          : null}
      </View>
      {sel && selected != null ? (
        <View style={[styles.detail, { backgroundColor: theme.colors.cardMuted }]}>
          <View style={styles.detailRow}>
            <Body weight="semibold" style={{ flex: 1 }}>
              {sel.label}
            </Body>
            <Money cents={totals[selected]} size={14.5} weight="bold" />
          </View>
          {sel.segments.map((seg) => (
            <View key={seg.key} style={styles.detailRow}>
              <View style={[styles.swatch, { backgroundColor: theme.tint(seg.color) }]} />
              <Caption tone="text" style={{ flex: 1 }}>
                {seg.label}
              </Caption>
              <Money cents={seg.cents} size={13.5} />
            </View>
          ))}
          {sel.reference ? (
            <View style={styles.detailRow}>
              <View style={[styles.refSwatch, { backgroundColor: theme.colors.text }]} />
              <Caption tone="text" style={{ flex: 1 }}>
                {referenceLabel ?? 'Repère'}
              </Caption>
              <Money cents={sel.reference} size={13.5} />
            </View>
          ) : null}
        </View>
      ) : (
        <Caption style={{ textAlign: 'center' }}>Touche une colonne pour voir le détail.</Caption>
      )}
    </View>
  );
}

/** Légende : pastille + libellé, toujours présente dès deux séries. */
export function ChartLegend({ items, reference }: { items: Array<{ key: string; label: string; color: string }>; reference?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.key} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: theme.tint(i.color) }]} />
          <Caption tone="text">{i.label}</Caption>
        </View>
      ))}
      {reference ? (
        <View style={styles.legendItem}>
          <View style={[styles.refSwatch, { backgroundColor: theme.colors.text }]} />
          <Caption tone="text">{reference}</Caption>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { position: 'absolute', top: 0, height: HEIGHT },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  detail: { borderRadius: 14, padding: spacing.md, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  refSwatch: { width: 14, height: 2, borderRadius: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
