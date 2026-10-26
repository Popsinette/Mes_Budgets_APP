import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { FlowFamily, FlowItem, MoneyFlowDetail } from '@/src/features/analytics/repository';
import { fonts, spacing, useTheme } from '@/src/theme';
import { formatCents } from '@/src/utils/money';
import { Body, Caption, Money } from '../ui/Text';

/**
 * « Où va mon argent » en diagramme de flux, deux colonnes seulement pour
 * rester lisible sur téléphone : mes revenus (un seul nœud) se divisent en
 * familles (factures, semaine, montants fixes, santé, épargne, reste) —
 * l'épaisseur de chaque ruban est proportionnelle au montant. Toucher
 * « Revenus » ou une famille la déplie poste par poste (paies, loyer,
 * courses, chaque cagnotte…) ; au-delà de 6 postes, les plus petits sont
 * regroupés en « Autres » dans le graphique (le tableau garde tout). Chaque
 * vue se dévoile de gauche à droite. Sous le graphique, le tableau chiffré
 * (lisible sans la couleur) sert aussi de navigation.
 */

/** Famille affichable : une famille de dépenses, ou « Revenus » (ses postes = les sources). */
type ChartFamily = Omit<FlowFamily, 'key'> & { key: string };

type Node = { key: string; label: string; cents: number; color: string };
type Placed = Node & { x: number; y: number; h: number };
/** Ruban en dégradé : couleur de sa source → couleur de sa destination. */
type Link = { from: string; to: string; cents: number; fromColor: string; toColor: string };

const NODE_W = 10;
const GAP = 14;
const LABEL_W = 142;
const LINE = 38; // hauteur minimale réservée à une étiquette (nom + montant)
const MAX_SHOWN = 6; // postes dessinés au plus ; les plus petits sont regroupés en « Autres »

/** Les `MAX_SHOWN` plus gros postes, le reste regroupé (pour le graphique seulement). */
function foldSmall(items: FlowItem[], color: string | null): FlowItem[] {
  if (items.length <= MAX_SHOWN + 1) return items;
  const kept = items.slice(0, MAX_SHOWN);
  const rest = items.slice(MAX_SHOWN);
  return [...kept, { key: 'autres', label: `Autres (${rest.length})`, cents: rest.reduce((s, i) => s + i.cents, 0), color }];
}

function compact(cents: number): string {
  return formatCents(Math.round(cents / 100) * 100, { compact: true });
}

/** Hauteur d'une colonne où chaque nœud occupe au moins `minSlot` (place pour son étiquette). */
function columnHeight(nodes: Node[], scale: number, minSlot: number): number {
  return nodes.reduce((s, n) => s + Math.max(minSlot, Math.max(2, n.cents * scale)), 0) + GAP * Math.max(0, nodes.length - 1);
}

/**
 * Place les nœuds d'une colonne (hauteurs ∝ montant, échelle commune). Chaque
 * nœud est centré dans une case d'au moins `minSlot` : son étiquette tombe
 * pile en face de son ruban, même pour un tout petit montant.
 */
function placeColumn(nodes: Node[], x: number, scale: number, height: number, minSlot = 0): Placed[] {
  const total = columnHeight(nodes, scale, minSlot);
  let y = (height - total) / 2;
  return nodes.map((n) => {
    const h = Math.max(2, n.cents * scale);
    const slot = Math.max(minSlot, h);
    const placed = { ...n, x, y: y + (slot - h) / 2, h };
    y += slot + GAP;
    return placed;
  });
}

/** Étiquettes sans chevauchement : centrées sur leur nœud, poussées vers le bas puis remontées si besoin. */
function labelPositions(nodes: Placed[], height: number): number[] {
  const ys = nodes.map((n) => n.y + n.h / 2);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + LINE);
  const overflow = ys.length ? ys[ys.length - 1] + LINE / 2 - height : 0;
  if (overflow > 0) {
    ys[ys.length - 1] -= overflow;
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - LINE);
  }
  return ys;
}

/** Ruban de A (bord droit) vers B (bord gauche), courbe de Bézier douce. */
function band(x0: number, y0: number, x1: number, y1: number, w: number): string {
  const mid = (x0 + x1) / 2;
  return `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1} L${x1},${y1 + w} C${mid},${y1 + w} ${mid},${y0 + w} ${x0},${y0 + w} Z`;
}

export function FlowChart({ detail }: { detail: MoneyFlowDetail }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;

  // « Revenus » se déplie comme une famille : ses postes sont les sources.
  const incomeFamily = useMemo<ChartFamily>(
    () => ({
      key: 'revenus',
      label: 'Revenus',
      cents: detail.income_cents + detail.over_cents,
      color: null,
      items: [
        ...detail.sources,
        ...(detail.over_cents > 0 ? [{ key: 'over', label: 'Au-delà de mes revenus', cents: detail.over_cents, color: null }] : []),
      ],
    }),
    [detail],
  );
  // Si la famille ouverte disparaît (autre mois), on revient à la vue d'ensemble.
  const family: ChartFamily | null =
    focusKey === 'revenus' ? incomeFamily : focusKey ? (detail.families.find((f) => f.key === focusKey) ?? null) : null;
  const setFocus = (f: ChartFamily | null) => setFocusKey(f ? f.key : null);

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reveal, family?.key, detail]);

  const neutral = theme.dark ? '#4A4A60' : '#D9D6E6';
  const colorOf = (c: string | null) => (c ? theme.tint(c) : neutral);
  const bandOpacity = theme.dark ? 0.42 : 0.34;

  const view = useMemo(() => {
    if (width === 0) return null;
    const right = width - LABEL_W - NODE_W;
    const incomeColor = theme.colors.primary;
    const nodeColor = (key: string, c: string | null) =>
      key === 'over' ? theme.colors.danger : family?.key === 'revenus' ? incomeColor : colorOf(c);

    let leftNodes: Node[];
    let rightNodes: Node[];
    if (!family) {
      // Vue d'ensemble : Revenus (+ dépassement) → familles.
      leftNodes = [{ key: 'revenus', label: 'Revenus', cents: detail.income_cents, color: incomeColor }];
      if (detail.over_cents > 0) {
        leftNodes.push({ key: 'over', label: 'Au-delà', cents: detail.over_cents, color: theme.colors.danger });
      }
      rightNodes = detail.families.map((f) => ({ key: f.key, label: f.label, cents: f.cents, color: colorOf(f.color) }));
    } else {
      // Vue d'une famille (ou des revenus) : famille → postes.
      leftNodes = [
        { key: family.key, label: family.label, cents: family.cents, color: family.key === 'revenus' ? incomeColor : colorOf(family.color) },
      ];
      rightNodes = foldSmall(family.items, family.color).map((i) => ({
        key: i.key,
        label: i.label,
        cents: i.cents,
        color: nodeColor(i.key, i.color),
      }));
    }
    const total = rightNodes.reduce((s, n) => s + n.cents, 0);
    // Les gros rubans remplissent ~280 px ; les petits postes gardent leur case d'étiquette.
    const scale = 280 / Math.max(1, total);
    const height = Math.max(columnHeight(rightNodes, scale, LINE), columnHeight(leftNodes, scale, LINE)) + 16;
    const left = placeColumn(leftNodes, 0, scale, height, LINE);
    const placedRight = placeColumn(rightNodes, right, scale, height, LINE);
    // Liens : chaque nœud de gauche se répartit sur les nœuds de droite, dans l'ordre.
    const links: Link[] = [];
    const remaining = new Map(rightNodes.map((n) => [n.key, n.cents]));
    for (const src of leftNodes) {
      let budget = src.cents;
      for (const dst of rightNodes) {
        const take = Math.min(budget, remaining.get(dst.key) ?? 0);
        if (take <= 0) continue;
        links.push({ from: src.key, to: dst.key, cents: take, fromColor: src.color, toColor: dst.color });
        remaining.set(dst.key, (remaining.get(dst.key) ?? 0) - take);
        budget -= take;
        if (budget <= 0) break;
      }
    }
    return { height, left, middle: [] as Placed[], right: placedRight, links, scale, rightTotal: total };
  }, [width, family, detail, theme]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const paths = useMemo(() => {
    if (!view) return [];
    const all = [...view.left, ...view.middle, ...view.right];
    const byKey = new Map(all.map((n) => [n.key, n]));
    const outOffset = new Map<string, number>();
    const inOffset = new Map<string, number>();
    const scale = view.scale;
    return view.links.map((l) => {
      const a = byKey.get(l.from)!;
      const b = byKey.get(l.to)!;
      const w = Math.max(1, l.cents * scale);
      const oa = outOffset.get(a.key) ?? 0;
      const ob = inOffset.get(b.key) ?? 0;
      outOffset.set(a.key, oa + w);
      inOffset.set(b.key, ob + w);
      return {
        key: `${l.from}>${l.to}`,
        id: `g${l.from}-${l.to}`.replace(/[^a-zA-Z0-9-]/g, ''),
        to: l.to,
        from: l.from,
        x0: a.x + NODE_W,
        x1: b.x,
        d: band(a.x + NODE_W, a.y + oa, b.x, b.y + ob, w),
        fromColor: l.fromColor,
        toColor: l.toColor,
      };
    });
  }, [view]);

  const rightLabels = view ? labelPositions(view.right, view.height) : [];
  const leftLabels = view ? labelPositions(view.left, view.height) : [];
  const shift = reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width] });
  const percentBase = view?.rightTotal ?? 0;
  const tableItems: Array<FlowItem & { family?: ChartFamily }> = family
    ? family.items
    : detail.families.map((f) => ({ ...f, family: f }));

  return (
    <View style={{ gap: spacing.md }}>
      {family ? (
        <Pressable
          onPress={() => {
            setFocus(null);
            setActive(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Revenir à la vue d’ensemble"
          style={({ pressed }) => [styles.back, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
          <Body size={13.5} weight="semibold" color={theme.colors.primary}>
            Vue d’ensemble
          </Body>
        </Pressable>
      ) : null}

      <View onLayout={onLayout} style={{ height: view?.height ?? 260, overflow: 'hidden' }}>
        {view ? (
          <Svg width={width} height={view.height}>
            <Defs>
              {paths.map((p) => (
                <LinearGradient key={p.id} id={p.id} gradientUnits="userSpaceOnUse" x1={p.x0} y1={0} x2={p.x1} y2={0}>
                  <Stop offset="0" stopColor={p.fromColor} />
                  <Stop offset="1" stopColor={p.toColor} />
                </LinearGradient>
              ))}
            </Defs>
            {paths.map((p) => (
              <Path
                key={p.key}
                d={p.d}
                fill={`url(#${p.id})`}
                opacity={active && active !== p.to && active !== p.from ? bandOpacity * 0.35 : bandOpacity}
              />
            ))}
            {[...view.left, ...view.middle, ...view.right].map((n) => (
              <Rect
                key={n.key}
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={n.h}
                rx={Math.min(4, n.h / 2)}
                fill={n.color}
                opacity={active && active !== n.key && n.key !== 'hub' && n.key !== family?.key ? 0.4 : 1}
              />
            ))}
            {/* Étiquettes de gauche : sur le ruban, à droite du nœud. */}
            {view.left.map((n, i) => (
              <SvgText key={`l-${n.key}`} x={n.x + NODE_W + 6} y={leftLabels[i] - 2} fontSize={13} fill={theme.colors.text} fontFamily={fonts.bodySemibold}>
                {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
              </SvgText>
            ))}
            {view.left.map((n, i) => (
              <SvgText key={`lv-${n.key}`} x={n.x + NODE_W + 6} y={leftLabels[i] + 15} fontSize={12.5} fill={theme.colors.text} fontFamily={fonts.displayBold}>
                {compact(n.cents)}
              </SvgText>
            ))}
            {/* Étiquettes de droite : nom + montant et part. */}
            {view.right.map((n, i) => (
              <SvgText key={`r-${n.key}`} x={n.x + NODE_W + 7} y={rightLabels[i] - 2} fontSize={13} fill={theme.colors.text} fontFamily={fonts.bodySemibold}>
                {n.label.length > 17 ? `${n.label.slice(0, 16)}…` : n.label}
              </SvgText>
            ))}
            {view.right.map((n, i) => (
              <SvgText key={`rv-${n.key}`} x={n.x + NODE_W + 7} y={rightLabels[i] + 14} fontSize={12} fill={theme.colors.textMuted} fontFamily={fonts.body}>
                {`${compact(n.cents)} · ${percentBase > 0 ? Math.round((n.cents / percentBase) * 100) : 0} %`}
              </SvgText>
            ))}
          </Svg>
        ) : null}

        {/* Zones de toucher : familles (vue d'ensemble) ou postes (vue détaillée). */}
        {view
          ? view.right.map((n, i) => (
              <Pressable
                key={`h-${n.key}`}
                onPress={() => {
                  if (!family) {
                    const f = detail.families.find((x) => x.key === n.key);
                    if (f && f.key !== 'reste') {
                      setFocus(f);
                      setActive(null);
                      return;
                    }
                  }
                  setActive(active === n.key ? null : n.key);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${n.label} : ${formatCents(n.cents)}${!family && n.key !== 'reste' ? '. Voir le détail' : ''}`}
                style={[styles.hit, { left: n.x - 24, top: Math.min(n.y, rightLabels[i] - LINE / 2), height: Math.max(n.h, LINE), width: width - n.x + 24 }]}
              />
            ))
          : null}

        {view && !family
          ? view.left
              .filter((n) => n.key === 'revenus' && detail.sources.length > 0)
              .map((n) => (
                <Pressable
                  key="h-revenus"
                  onPress={() => {
                    setFocus(incomeFamily);
                    setActive(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Revenus : ${formatCents(n.cents)}. Voir le détail`}
                  style={[styles.hit, { left: 0, top: n.y, height: n.h, width: 120 }]}
                />
              ))
          : null}

        {/* Dévoilement de gauche à droite à chaque changement de vue. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.curtain, { backgroundColor: theme.colors.card, transform: [{ translateX: shift }] }]}
        />
      </View>

      <View>
        {!family && detail.sources.length > 0 ? (
          <Pressable
            onPress={() => setFocus(incomeFamily)}
            accessibilityRole="button"
            accessibilityLabel={`Revenus : ${formatCents(detail.income_cents)}. Voir le détail`}
            style={({ pressed }) => [styles.row, styles.incomeRow, { borderBottomColor: theme.colors.hairline, opacity: pressed ? 0.6 : 1 }]}
          >
            <View style={[styles.swatch, { backgroundColor: theme.colors.primary }]} />
            <Body size={14} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
              Revenus ({detail.sources.length})
            </Body>
            <Money cents={detail.income_cents} size={14} weight="bold" />
            <View style={styles.pct} />
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
        {tableItems.map((item) => {
          const tappable = !family && item.key !== 'reste';
          return (
            <Pressable
              key={item.key}
              disabled={!tappable}
              onPress={() => item.family && setFocus(item.family)}
              accessibilityRole={tappable ? 'button' : undefined}
              accessibilityLabel={`${item.label} : ${formatCents(item.cents)}`}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor:
                      item.key === 'over' ? theme.colors.danger : family?.key === 'revenus' ? theme.colors.primary : colorOf(item.color),
                  },
                ]}
              />
              <Body size={14} weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                {item.label}
              </Body>
              <Money cents={item.cents} size={14} weight="semibold" />
              <Caption style={styles.pct}>{percentBase > 0 ? Math.round((item.cents / percentBase) * 100) : 0} %</Caption>
              {tappable ? <Ionicons name="chevron-forward" size={15} color={theme.colors.textMuted} /> : <View style={{ width: 15 }} />}
            </Pressable>
          );
        })}
        <Caption style={{ marginTop: spacing.xs }}>
          {family
            ? `% = part de ${family.label.toLowerCase()} (${formatCents(family.cents)}).`
            : 'Touche « Revenus » ou une famille pour la déplier poste par poste. % = part de tes revenus.'}
        </Caption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { position: 'absolute' },
  curtain: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 999,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  pct: { width: 40, textAlign: 'right' },
  incomeRow: { borderBottomWidth: 1, marginBottom: 4, paddingBottom: 10 },
});
