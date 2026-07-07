# Notes de maintenance — Custom Dropdown Card

Document interne destiné à quiconque (y compris moi) reprendra le code plus tard.
Il décrit l'architecture, les décisions non évidentes et les pièges déjà rencontrés.

Fichier unique : `custom-dropdown-card.js`. Deux custom elements :
- `custom-dropdown-card` → la carte (classe `CustomDropdownCard`)
- `custom-dropdown-card-editor` → l'éditeur graphique (classe `CustomDropdownCardEditor`)

Aucune dépendance externe. On réutilise les composants du frontend HA (`ha-card`,
`ha-icon`, `ha-form`, `ha-expansion-panel`) déjà chargés dans la page.

---

## 1. La carte — `CustomDropdownCard`

### Cycle de vie HA
Ordre d'appel garanti par HA : `setConfig(config)` **puis** `set hass(hass)` (répété
à chaque changement d'état, ~1×/s). `getConfigElement()` renvoie l'éditeur.

### État interne
- `_config` : config normalisée.
- `_selected` : dernière option cliquée (objet option). Persistée en localStorage si `persist`.
- `_open` : menu ouvert ou non (piloté aussi par l'attribut `[open]` sur l'hôte, utilisé en CSS).
- `_built` : DOM construit au moins une fois.
- `_templateResult` / `_subscribedTemplate` / `_unsubTemplate` : état de l'abonnement au modèle Jinja.

### Rendu
- `_render()` réécrit `shadowRoot.innerHTML` en entier (style + structure). Appelé par
  `setConfig`, et par `set hass` seulement si `!_built`.
- `_updateCollapsedValue()` ne reconstruit PAS le DOM : il met à jour la valeur repliée,
  l'icône/image d'en-tête et le fond de l'en-tête. Appelé fréquemment (chaque `set hass`,
  chaque résultat de template). **Ne jamais y déclencher de `_render()`** sous peine de
  reconstruire la carte à chaque tick d'état.

### Valeur repliée — `_resolveCollapsedOption()`
Priorité : `value_template` > `entity`/`attribute` > `_selected`. Si la valeur résolue
matche le `value`/`label` d'une option, on renvoie cette option (pour récupérer icône/couleur).

### Modèle Jinja — `_maybeSubscribeTemplate()`
Abonnement WebSocket `render_template` via `hass.connection.subscribeMessage`.
- Idempotent : ne se réabonne pas si le template n'a pas changé.
- `subscribeMessage` renvoie une `Promise<unsub>` : on stocke la promesse, on l'`await`
  implicitement au moment du désabonnement (`Promise.resolve(unsub).then(u => u())`).
- Désabonnement dans `disconnectedCallback` et avant tout réabonnement.
- Appelé depuis `setConfig` (hass souvent absent → return anticipé) ET `set hass`.

### Actions — `_runAction(action, option)`
Gère `more-info`, `navigate`, `url`, `toggle`, `call-service`/`perform-action`,
`fire-dom-event`, `none`. Fallback : ré-émission d'un événement `hass-action`.
`_fire(type, detail, node)` crée un `Event` bubbling + composed (traverse le shadow DOM).

### Fermeture au clic extérieur — `_handleOutsideClick`
Utilise `event.composedPath().includes(this)` (et NON `contains`, qui ne fonctionne pas
avec un Event ni à travers le shadow DOM). Écouteur ajouté au `document` seulement quand
le menu est ouvert, retiré à la fermeture.

---

## 2. L'éditeur — `CustomDropdownCardEditor`

### Principe
- Section principale : un `ha-form` piloté par `_mainSchema` (sélecteurs natifs HA, dont
  `ui_action` pour l'éditeur d'action et `template` pour le modèle Jinja).
- Chaque option : un `ha-expansion-panel` contenant un `ha-form` (`_optionSchema`) + une
  barre d'outils (monter / descendre / supprimer).
- Aperçu en direct : une **vraie instance** de `custom-dropdown-card` (`_preview`).

### Le piège central : le round-trip `config-changed` → `setConfig`
Quand l'éditeur émet `config-changed`, HA lui **renvoie** la config via `setConfig`.
Si `setConfig` reconstruit tout le DOM à chaque frappe, les panneaux se replient et le
focus saute (insupportable pour saisir un code couleur caractère par caractère).

Solution (voir `setConfig` + `_syncForms`) :
- On compare la **structure** (nombre d'options). Si identique → simple changement de
  valeur → on met à jour les `.data` des `ha-form` existants **sans reconstruire** le DOM.
- Reconstruction complète (`_render`) uniquement si le nombre d'options change
  (ajout / suppression) — ou au premier rendu.
- `_built` distingue « déjà rendu » de « premier rendu ».

### Mutations
- `_updateMain` / `_updateOption` : modifient `_config`, émettent `config-changed`,
  rafraîchissent l'aperçu. Ne reconstruisent pas (préservation du focus).
- `_addOption` / `_removeOption` / `_moveOption` : modifient la structure → `_render()`.
- `_syncForms` : réinjecte `.data` dans les `ha-form` (valeurs identiques → pas de saut de curseur).
  Programmer `.data` ne déclenche pas `value-changed` (seule la saisie utilisateur le fait) → pas de boucle.

### Aperçu
`_updatePreview()` appelle `_preview.setConfig(_config)` (dans un try/catch : la config
peut être transitoirement invalide pendant la frappe). Le remplacement de `innerHTML`
lors d'un `_render` détache l'ancien aperçu → son `disconnectedCallback` se déclenche →
l'abonnement template de l'aperçu est nettoyé (pas de fuite).

---

## 3. Pièges CSS résolus (ne pas régresser)

### Arrondi (`radius`)
`ha-card` définit dans SON shadow DOM `:host { border-radius: var(--ha-card-border-radius, 12px) }`.
Le sélecteur `:host` (spécificité 0,1,0) bat une règle externe `ha-card { border-radius }`
(0,0,1). Deux parades cumulées, gardées volontairement :
1. `--ha-card-border-radius: {radius}px` (alimente la variable lue par ha-card).
2. `border-radius: {radius}px !important` (l'`!important` auteur bat toute règle normale).
L'en-tête reçoit aussi le radius, car le fond d'une option sélectionnée (rectangle plein)
recouvrait sinon les coins arrondis du haut.

### Menu déplié
- `position: absolute; top: 100%` sur `.menu`, dans un `.wrapper { position: relative }`.
- `ha-card` est en `overflow: visible` pour laisser le menu déborder.
- `menu_width` : si défini, `right: auto; width/min-width: <valeur>` (nombre → `px`,
  sinon valeur CSS telle quelle). Sinon `right: 0` (largeur de la carte).
- `scrollbar-gutter: stable` : réserve la place de la scrollbar pour qu'elle ne recouvre
  pas les options.

---

## 4. Piège JS résolu : ordre du spread dans `setConfig`

Historiquement `{ ...défauts, ...config }` (spread EN DERNIER) : un `radius: undefined`
renvoyé par l'éditeur (champ vidé) écrasait le défaut `12` → `border-radius: undefinedpx`.
Corrigé : `{ ...config, ...défauts normalisés }` — les défauts priment, et `...config`
ne sert plus qu'à laisser passer les clés non listées (`value_template`, `type`, …).

---

## 5. Idées / extensions possibles (non implémentées)

- Variante **bidirectionnelle** : au clic, écrire dans un `input_select`/`input_text` HA
  (`select_option`) pour un état centralisé et synchronisé entre appareils. Écartée à la
  demande de l'utilisateur (nécessite un helper par dropdown).
- Réglage d'**alignement** du menu (gauche/centre/droite) en complément de `menu_width`.
- **Couleur de survol** configurable (actuellement le fond inline d'une option l'emporte
  sur `.option:hover`).
- Affichage d'un **message d'erreur** si le rendu du modèle Jinja échoue.

---

## 6. Vérifications avant commit

- Pas de runtime Node dans l'environnement de dev habituel → vérifier au moins :
  - équilibrage accolades / backticks (un déséquilibre de parenthèses en comptage brut
    est normal : il vient des commentaires `// 0)`, `// 1)`, `// 2)`).
  - la console affiche la bonne version au chargement.
- Bumper `VERSION` (constante en haut) **et** rappeler d'incrémenter `?v=N` sur la ressource HA.

## 7. Historique des versions

- **1.0.0** : carte de base + gestion des actions HA.
- **1.1.0** : éditeur graphique (`ha-form`, panneaux d'options, éditeur d'action natif).
- **1.2.0** : aperçu en direct dans l'éditeur.
- **1.3.0** : par option — `hide_label` (masquer le texte) et `background` (couleur de fond).
- **1.4.0** : `hide_chevron` (masquer la flèche).
- **1.5.0** : fix éditeur — plus de repli/perte de focus à chaque frappe (diff de structure).
- **1.6.0** : `value_template` (valeur repliée via modèle Jinja) + fix arrondi via variable CSS.
- **1.6.1** : arrondi forcé en `!important` + arrondi de l'en-tête.
- **1.7.0** : `menu_width` (largeur du menu déplié) + `scrollbar-gutter: stable`.
- **1.7.1** : fix ordre du spread `setConfig` ; nettoyage (`match_entity` et `.title-row` morts supprimés).
