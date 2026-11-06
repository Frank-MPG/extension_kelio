# Kelio – Interface repensée

Refonte de Kelio (`lfp.kelio.io`) : nouvel accueil, thème clair / sombre (auto, ou forcé depuis la popup).

## Fonctionnement

- **Accueil** (`portail.jsp`, appli GWT) : les widgets Kelio n'ont aucune classe, seulement des attributs
  `type="PortailVignette…"`. `home.js` masque la grille d'origine (`visibility: hidden`, elle reste
  fonctionnelle), lit ses données et affiche par-dessus `#kx-home` (Ma journée, Raccourcis, Notifications,
  Absences du jour, Bienvenue à, Nouveautés, Liens utiles). Chaque clic est rejoué sur le widget Kelio
  (`fire()` : point central → `elementFromPoint` → pointer/mouse events). Un `MutationObserver` re-rend
  la vue quand Kelio change son DOM. Bouton « Vue Kelio » : retour temporaire à l'accueil d'origine.
- Attention : la feuille GWT impose `div { position: absolute; overflow: hidden }` (corrigé dans `#kx-home`).
- **Pages internes** (`/open/homepage?ACTION=…`, JSP dans l'iframe) : `pages.css` sur les classes Kelio
  (`menuGauche`, `presenceBordered`, `zoneFiltre`, `boutonAction`…), `pages.js` pour les lignes du tableau
  des déclarations (jour, alternance, week-end, aujourd'hui).
- `settings.js` (tous les cadres) : `html.kx-on` + `html[data-kx-theme]`, depuis `chrome.storage.sync`
  (copie en localStorage pour éviter le flash). Tous les styles sont sous `html.kx-on`.
- **Calendrier des absences** (`calendar.js`, monde MAIN, iframe `intranet_calendrier_absence.jsp`) : appli GWT
  dessinée entièrement dans un canvas. On intercepte `fillRect` / `fillText` / `drawImage` / chemins, on tient une
  liste d'affichage (un rectangle opaque efface ce qu'il recouvre) et on en déduit mois, jours, absences
  (couleur, code, demi-journée), télétravail, fériés, sélection, légende. Vue HTML à la place (`#kxc`) ; chaque
  action est rejouée sur le canvas aux coordonnées Kelio (avec un mousemove préalable : Kelio clique sur la
  case survolée). Boîte de dialogue Kelio (voile rgba sur tout le canvas) → canvas d'origine réaffiché.
