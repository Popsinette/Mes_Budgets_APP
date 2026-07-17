import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Coquille HTML de la version web (PWA). Les chemins (manifest, service
 * worker, icônes) sont relatifs pour fonctionner aussi bien à la racine
 * d'un domaine que sous un sous-chemin (GitHub Pages).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <title>Mes Budgets</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="description" content="Suivi de budgets mensuels, plan d'épargne et factures — 100 % local." />
        <meta name="theme-color" content="#F6F0E6" />

        {/* PWA installable */}
        <link rel="manifest" href="manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* iOS : plein écran depuis l'écran d'accueil */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Mes Budgets" />
        <link rel="apple-touch-icon" href="icons/icon.png" />

        <ScrollViewStyleReset />

        {/* Service worker : mode hors-ligne après la première visite */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('sw.js').catch(function () {});
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
