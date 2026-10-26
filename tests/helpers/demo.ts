// Jeu de démonstration (6 mois) — sert aux captures d'écran via « Restaurer une sauvegarde ».
import { writeFileSync } from 'node:fs';
import { buildBackup } from '@/src/features/backup/repository';
import { saveEnvelope, saveTemplate } from '@/src/features/envelopes/repository';
import { saveFixedItem, setFixedChecked, listFixedForMonth } from '@/src/features/fixed/repository';
import { saveHealthExpense } from '@/src/features/health/repository';
import { addMove, listPots, savePot, setPlanDone } from '@/src/features/savings/repository';
import { categoryPalette } from '@/src/theme/palette';
import { emptyDb } from './db';
import { spend } from './scenario';

async function main(out: string) {
  const { db } = await emptyDb();
  await saveFixedItem(db, { kind: 'income', name: 'Salaire', amountCents: 245000, day: 28, frequency: 'monthly', startMonth: '2026-01', icon: 'cash-outline' });
  await saveFixedItem(db, { kind: 'income', name: 'CAF', amountCents: 14000, day: 5, frequency: 'monthly', startMonth: '2026-01', icon: 'people-outline' });
  // Petits revenus ponctuels d'octobre : beaucoup de sources (cas réel du diagramme).
  const extras: Array<[string, number]> = [
    ['Acompte 106', 25000],
    ['Prime carburant', 20000],
    ['Remboursement mamie', 5400],
    ['Remboursement Vinted', 2900],
    ['Remboursement normal', 2900],
    ['Régul', 100],
  ];
  for (const [name, cents] of extras) {
    await saveFixedItem(db, { kind: 'income', name, amountCents: cents, day: 12, frequency: 'once', startMonth: '2026-10', icon: 'cash-outline' });
  }
  const charges: Array<[string, number, number, string]> = [
    ['Loyer', 82000, 5, 'home-outline'],
    ['Électricité', 9500, 10, 'flash-outline'],
    ['Internet & mobile', 4500, 12, 'wifi-outline'],
    ['Assurance auto', 6200, 15, 'car-outline'],
    ['Netflix', 1399, 20, 'tv-outline'],
  ];
  for (const [name, cents, day, icon] of charges) {
    await saveFixedItem(db, { kind: 'charge', name, amountCents: cents, day, frequency: 'monthly', startMonth: '2026-01', icon });
  }
  await saveTemplate(db, { name: 'Courses', icon: 'cart-outline', color: categoryPalette[1], amountCents: 9000, period: 'week' });
  await saveTemplate(db, { name: 'Plaisir', icon: 'happy-outline', color: categoryPalette[5], amountCents: 4000, period: 'week' });
  await saveTemplate(db, { name: 'Essence', icon: 'car-sport-outline', color: categoryPalette[4], amountCents: 12000, period: 'month' });
  await saveTemplate(db, { name: 'Coiffure', icon: 'cut-outline', color: categoryPalette[9], amountCents: 6000, period: 'month' });
  await savePot(db, { name: 'Vacances', icon: 'airplane-outline', color: categoryPalette[7], kind: 'projet', initialCents: 40000, targetCents: 200000, monthlyCents: 15000, deadline: '2027-07-01' });
  await savePot(db, { name: 'Matelas de sécurité', icon: 'shield-checkmark-outline', color: categoryPalette[0], kind: 'securite', initialCents: 250000, targetCents: null, monthlyCents: 10000, deadline: null });
  await savePot(db, { name: 'Noël', icon: 'gift-outline', color: categoryPalette[8], kind: 'projet', initialCents: 5000, targetCents: 40000, monthlyCents: 8000, deadline: '2026-12-15' });

  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (const month of months) {
    const last = month === '2026-10';
    const maxDay = last ? 25 : 28;
    for (let d = 2; d <= maxDay; d += 3) {
      const day = String(d).padStart(2, '0');
      await spend(db, month, 'Courses', Math.round(2500 + rnd() * 5500), `${month}-${day}`, !last || d < 22);
      if (rnd() > 0.55) await spend(db, month, 'Plaisir', Math.round(800 + rnd() * 3200), `${month}-${day}`, !last || d < 22);
    }
    await spend(db, month, 'Essence', Math.round(9000 + rnd() * 6000), `${month}-08`, true);
    if (month !== '2026-07') await spend(db, month, 'Coiffure', 6000, `${month}-14`, true);
    if (month === '2026-08') await saveEnvelope(db, { month, name: 'Anniversaire', icon: 'gift-outline', color: categoryPalette[10], amountCents: 8000, period: 'month' });
    if (month === '2026-08') await spend(db, month, 'Anniversaire', 7600, `${month}-19`, true);
    if (month === '2026-06') await saveHealthExpense(db, { label: 'Dentiste', date: `${month}-11`, amountCents: 9000, refundCents: 6000, settled: true });
    for (const item of await listFixedForMonth(db, month)) {
      if (!last || item.day <= 15) await setFixedChecked(db, item.id, month, true);
    }
    for (const pot of await listPots(db, month)) {
      if (!last || pot.name !== 'Noël') await setPlanDone(db, pot, month, true, `${month}-02`);
    }
  }
  const pots = await listPots(db, '2026-10');
  await addMove(db, { potId: pots.find((p) => p.name === 'Vacances')!.id, amountCents: 12000, date: '2026-09-30', note: 'Reste de septembre' });
  writeFileSync(out, JSON.stringify(await buildBackup(db), null, 1));
  console.log('ok', out);
}
void main(process.argv[2]);
