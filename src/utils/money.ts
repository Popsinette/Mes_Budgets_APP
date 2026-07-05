/** Tous les montants sont stockés en centimes (entiers) pour éviter les erreurs de virgule flottante. */

export function formatCents(cents: number, options?: { signed?: boolean }): string {
  const euros = cents / 100;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(euros));
  } catch {
    formatted = `${Math.abs(euros).toFixed(2).replace('.', ',')} €`;
  }
  if (options?.signed) {
    return `${cents < 0 ? '−' : '+'}${formatted}`;
  }
  return cents < 0 ? `−${formatted}` : formatted;
}

/** Parse une saisie utilisateur ("12,50", "12.50", "1 200") en centimes. Renvoie null si invalide. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
  if (!cleaned || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
