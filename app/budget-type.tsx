import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  applyTemplateToMonth,
  listBudgetTemplate,
  setTemplateAmount,
  type TemplateLine,
} from '@/src/features/budgets/repository';
import { getMonthlySavingsTarget } from '@/src/features/savings/repository';
import { getYearOverview } from '@/src/features/transactions/repository';
import { useBudgetMethod, type BudgetMethod } from '@/src/store/budgetMethod';
import { useSelectedMonth } from '@/src/store/month';
import { fonts, radius, spacing, useTheme } from '@/src/theme';
import { monthKeyLabel } from '@/src/utils/dates';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { formatCents, parseAmountToCents } from '@/src/utils/money';

const METHODS: Array<[BudgetMethod, string, string]> = [
  [
    '50-30-20',
    '50/30/20',
    'La référence : 50 % besoins, 30 % envies, 20 % épargne, calculé sur votre revenu mensuel moyen.',
  ],
  [
    '80-20',
    '80/20',
    "L'épargne d'abord : 20 % mis de côté dès le début du mois, 80 % pour vivre (besoins et envies confondus).",
  ],
  [
    'zero',
    'Base zéro',
    'Chaque euro reçoit un poste : répartissez tout votre revenu jusqu’à un reste à répartir de 0 €.',
  ],
];

/** Cibles par poste selon la méthode, en centimes (base = revenu mensuel moyen). */
function targetsFor(method: BudgetMethod, base: number) {
  if (method === '50-30-20') {
    return { besoins: Math.round(base * 0.5), envies: Math.round(base * 0.3), epargne: Math.round(base * 0.2) };
  }
  if (method === '80-20') {
    return { besoins: null, envies: null, epargne: Math.round(base * 0.2) };
  }
  return { besoins: null, envies: null, epargne: null };
}

function AmountCell({
  line,
  onCommit,
}: {
  line: TemplateLine;
  onCommit: (cents: number) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(line.amount_cents > 0 ? (line.amount_cents / 100).toString().replace('.', ',') : '');
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onEndEditing={() => onCommit(parseAmountToCents(text) ?? 0)}
      onBlur={() => onCommit(parseAmountToCents(text) ?? 0)}
      keyboardType="decimal-pad"
      placeholder="0"
      placeholderTextColor={theme.colors.textMuted}
      accessibilityLabel={`Budget type ${line.category_name}`}
      style={[
        styles.amountInput,
        {
          color: theme.colors.text,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.cardMuted,
        },
      ]}
    />
  );
}

export default function BudgetTypeScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const month = useSelectedMonth((s) => s.month);
  const method = useBudgetMethod((s) => s.method);
  const setMethod = useBudgetMethod((s) => s.setMethod);

  const { data: template } = useLiveQuery((db) => listBudgetTemplate(db));
  const { data: savingsTarget } = useLiveQuery((db) => getMonthlySavingsTarget(db));
  const year = Number(month.slice(0, 4));
  const { data: yearData } = useLiveQuery((db) => getYearOverview(db, year), [year]);

  // Base de calcul : revenu mensuel moyen sur les mois de l'année qui ont des revenus.
  const base = useMemo(() => {
    const withIncome = (yearData ?? []).filter((m) => m.income_cents > 0);
    if (withIncome.length === 0) return 0;
    return Math.round(withIncome.reduce((s, m) => s + m.income_cents, 0) / withIncome.length);
  }, [yearData]);

  const lines = template ?? [];
  const besoins = lines.filter((l) => l.bucket === 'besoins');
  const envies = lines.filter((l) => l.bucket === 'envies');
  const epargneLines = lines.filter((l) => l.bucket === 'epargne');
  const besoinsTotal = besoins.reduce((s, l) => s + l.amount_cents, 0);
  const enviesTotal = envies.reduce((s, l) => s + l.amount_cents, 0);
  // Poste épargne = virements mensuels prévus des comptes + catégories « épargne ».
  const epargneTotal = (savingsTarget ?? 0) + epargneLines.reduce((s, l) => s + l.amount_cents, 0);
  const allocated = besoinsTotal + enviesTotal + epargneTotal;
  const leftToSplit = base - allocated;
  const targets = targetsFor(method, base);
  const methodInfo = METHODS.find(([value]) => value === method);

  const commit = (categoryId: number) => (cents: number) => {
    void setTemplateAmount(db, categoryId, cents);
  };

  const apply = () => {
    confirmAction({
      title: 'Copier dans le mois affiché',
      message: `Les montants du budget type seront recopiés dans les budgets de ${monthKeyLabel(month)} (créés ou mis à jour). Les budgets sans équivalent dans le modèle sont conservés.`,
      confirmLabel: 'Copier',
      onConfirm: () => {
        void (async () => {
          const written = await applyTemplateToMonth(db, month);
          notify(
            'Budget type copié',
            written > 0
              ? `${written} budget${written > 1 ? 's' : ''} écrit${written > 1 ? 's' : ''} pour ${monthKeyLabel(month)}.`
              : 'Le modèle est vide : saisissez des montants d’abord.',
          );
        })();
      },
    });
  };

  const renderPoste = (
    title: string,
    subtitle: string,
    items: TemplateLine[],
    total: number,
    target: number | null,
    extra?: string,
  ) => {
    const over = target != null && total > target;
    return (
      <>
        <SectionHeader title={title} />
        <Card style={{ gap: spacing.md }}>
          <View style={styles.posteHeader}>
            <View style={{ flex: 1, gap: 1 }}>
              <Money cents={total} size={22} weight="bold" tone={over ? 'danger' : 'text'} />
              <Caption>{subtitle}</Caption>
            </View>
            {target != null ? (
              <View style={{ alignItems: 'flex-end', gap: 1 }}>
                <Eyebrow>Cible</Eyebrow>
                <Money cents={target} size={14} weight="semibold" tone="muted" />
              </View>
            ) : null}
          </View>
          {target != null && target > 0 ? (
            <ProgressBar
              ratio={total / target}
              color={over ? theme.colors.danger : total / target > 0.9 ? theme.colors.warning : theme.colors.success}
            />
          ) : null}
          {items.map((line) => (
            <View key={line.category_id} style={styles.lineRow}>
              <CategoryIcon icon={line.category_icon} color={line.category_color} size={34} />
              <Body weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                {line.category_name}
              </Body>
              <AmountCell line={line} onCommit={commit(line.category_id)} />
            </View>
          ))}
          {extra ? <Caption>{extra}</Caption> : null}
        </Card>
      </>
    );
  };

  return (
    <Screen>
      <ModalHeader title="Budget type" />
      <Caption>
        Votre mois idéal : la photo que vous visez. Saisissez un montant par catégorie, puis
        recopiez le modèle dans un mois réel.
      </Caption>

      <Card style={{ gap: spacing.md }}>
        <View style={styles.posteHeader}>
          <View style={{ flex: 1, gap: 1 }}>
            <Eyebrow>Budget disponible</Eyebrow>
            <Money cents={base} size={26} weight="bold" />
            <Caption>revenu mensuel moyen de l'année {year}</Caption>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 1 }}>
            <Eyebrow>Reste à répartir</Eyebrow>
            <Money
              cents={leftToSplit}
              size={16}
              weight="semibold"
              tone={leftToSplit < 0 ? 'danger' : method === 'zero' && leftToSplit > 0 ? 'warning' : 'text'}
            />
          </View>
        </View>
        {base === 0 ? (
          <Caption>
            Ajoutez vos revenus (même « à venir ») depuis l'accueil pour calculer la base du modèle.
          </Caption>
        ) : null}
      </Card>

      <SectionHeader title="Ma méthode de budget" />
      <Card style={{ gap: spacing.md }}>
        <View style={styles.methodRow}>
          {METHODS.map(([value, label]) => (
            <Chip key={value} label={label} selected={method === value} onPress={() => setMethod(value)} />
          ))}
        </View>
        {methodInfo ? (
          <Body tone="muted" size={13}>
            {methodInfo[2]}
          </Body>
        ) : null}
      </Card>

      {renderPoste(
        'Besoins',
        method === '80-20' ? 'l’essentiel du quotidien' : 'loyer, courses, transport, santé…',
        besoins,
        besoinsTotal,
        targets.besoins,
      )}
      {renderPoste(
        'Envies & loisirs',
        'sorties, restaurants, plaisirs',
        envies,
        enviesTotal,
        targets.envies,
      )}
      {renderPoste(
        'Épargne & investissement',
        'mis de côté chaque mois',
        epargneLines,
        epargneTotal,
        targets.epargne,
        (savingsTarget ?? 0) > 0
          ? `Dont ${formatCents(savingsTarget ?? 0)} de virements mensuels prévus sur vos comptes d'épargne (réglés dans l'onglet Épargne).`
          : 'Les virements mensuels de vos comptes d’épargne (onglet Épargne) comptent aussi dans ce poste.',
      )}

      <Button label={`Copier dans ${monthKeyLabel(month)}`} onPress={apply} />
      <Caption style={{ textAlign: 'center' }}>
        Sur l'écran Budgets, l'écart du mois se lit face à ces montants.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  posteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  amountInput: {
    minWidth: 96,
    textAlign: 'right',
    fontFamily: fonts.displaySemibold,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
