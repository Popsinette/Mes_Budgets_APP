import { Redirect } from 'expo-router';

/** Emplacement du bouton + central de la barre d'onglets (jamais affiché). */
export default function AddTabPlaceholder() {
  return <Redirect href="/" />;
}
