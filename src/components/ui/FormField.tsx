import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  suffix?: string;
};

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  suffix,
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
          style={[styles.input, { color: theme.colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
        />
        {suffix ? <Text style={[styles.suffix, { color: theme.colors.textMuted }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

/** Saisie de montant en euros ("12,50"). */
export function AmountField(props: Omit<FormFieldProps, 'keyboardType' | 'suffix'>) {
  return <FormField {...props} keyboardType="decimal-pad" suffix="€" />;
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs + 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: spacing.md + 2,
  },
  suffix: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
});
