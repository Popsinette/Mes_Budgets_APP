import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { fonts, radius, spacing, useTheme } from '@/src/theme';

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  suffix?: string;
  /** Rendu « montant » : chiffres Schibsted tabulaires, plus grand. */
  display?: boolean;
};

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  suffix,
  display,
}: FormFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
        ]}
      >
        <TextInput
          style={[display ? styles.inputDisplay : styles.input, { color: theme.colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
        />
        {suffix ? (
          <Text style={[display ? styles.suffixDisplay : styles.suffix, { color: theme.colors.textMuted }]}>
            {suffix}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Saisie de montant en euros ("12,50"). */
export function AmountField(props: Omit<FormFieldProps, 'keyboardType' | 'suffix' | 'display'>) {
  return <FormField {...props} keyboardType="decimal-pad" suffix="€" display />;
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingVertical: spacing.md + 2,
  },
  inputDisplay: {
    flex: 1,
    fontFamily: fonts.displaySemibold,
    fontSize: 24,
    letterSpacing: -0.4,
    paddingVertical: spacing.md + 2,
  },
  suffix: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    marginLeft: spacing.sm,
  },
  suffixDisplay: {
    fontFamily: fonts.displaySemibold,
    fontSize: 20,
    marginLeft: spacing.sm,
  },
});
