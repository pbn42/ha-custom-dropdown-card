# Custom Dropdown Card pour Home Assistant

Une carte Lovelace **liste déroulante 100 % personnalisable** : chaque option peut avoir son texte, sa valeur, son icône, son image, ses couleurs (texte + fond) et sa propre action Home Assistant. Repliée, la carte affiche la **dernière valeur cliquée**, ou la valeur d'un **capteur**, ou le résultat d'un **modèle Jinja**.

Livrée en **un seul fichier**, sans dépendance, avec un **éditeur graphique** intégré et un **aperçu en direct**.

![version](https://img.shields.io/badge/version-1.7.1-blue)

---

## Fonctionnalités

- 🎨 Options entièrement personnalisables : texte, sous-texte, icône, image, couleur du texte, couleur de fond.
- 👁️ Masquage possible du texte par option (icône/image seule).
- 🔗 Action Home Assistant par option (via l'éditeur d'action natif) : appel de service, navigation, URL, bascule, more-info, etc.
- 📌 Valeur repliée = dernière option cliquée (mémorisée), **ou** état d'un capteur, **ou** modèle Jinja.
- 🧩 Éditeur graphique complet + aperçu en direct dans l'éditeur.
- 🛠️ Réglages d'apparence : arrondi, fond, largeur du menu déplié, masquage de la flèche.

---

## Installation

1. Copier `custom-dropdown-card.js` dans le dossier `/config/www/` de Home Assistant
   (chemin final : `/config/www/custom-dropdown-card.js`).
2. **Paramètres → Tableaux de bord → menu ⋮ → Ressources → Ajouter une ressource**
   - **URL** : `/local/custom-dropdown-card.js?v=1` &nbsp;*(le `?v=1` est important, voir « Mise à jour »)*
   - **Type** : `Module JavaScript`

   > Si le menu « Ressources » n'apparaît pas : Profil → activer le **Mode avancé**.
3. Recharger la page. Dans la console (F12) doit apparaître `CUSTOM-DROPDOWN-CARD v1.7.1`.
4. **Ajouter une carte → rechercher « Custom Dropdown Card »**.

`/local/` correspond au dossier `/config/www/`.

### Mise à jour ⚠️

Le frontend Home Assistant met les ressources JS en cache via un *service worker*. **À chaque remplacement du fichier, incrémente le numéro de version dans l'URL de la ressource** (`?v=2`, `?v=3`, …). Sinon un rafraîchissement normal peut continuer à servir l'ancienne version (symptôme typique : un changement qui « marche après Ctrl+Shift+R puis disparaît »).

---

## Configuration

### Options de la carte

| Clé | Type | Défaut | Description |
|---|---|---|---|
| `title` | string | `""` | Titre affiché au-dessus de la valeur. |
| `icon` | string | – | Icône `mdi:` par défaut de l'en-tête (si l'option sélectionnée n'en fournit pas). |
| `entity` | string | – | Capteur/entité dont l'état sert de valeur repliée. |
| `attribute` | string | – | Attribut de l'entité à lire au lieu de l'état. |
| `value_template` | string (Jinja) | – | Modèle rendu par HA pour la valeur repliée. **Prioritaire** sur `entity`. |
| `placeholder` | string | `"Sélectionner…"` | Texte affiché quand aucune valeur n'est encore résolue. |
| `persist` | bool | `true` | Mémorise la dernière sélection (localStorage). |
| `close_on_select` | bool | `true` | Referme le menu après un clic sur une option. |
| `hide_chevron` | bool | `false` | Masque la flèche ▾ de dépliage (le clic sur l'en-tête déplie toujours). |
| `menu_width` | string CSS | – | Largeur du menu déplié (`260px`, `130%`, `min(320px,90vw)`…). Vide = largeur de la carte. |
| `background` | string CSS | – | Fond de la carte. |
| `radius` | number | `12` | Arrondi des coins, en pixels. |
| `options` | list | **requis** | Liste des options (voir ci-dessous). |

### Options d'une entrée (`options[]`)

| Clé | Type | Description |
|---|---|---|
| `label` | string | Texte affiché. |
| `value` | string | Valeur logique (sert au rapprochement avec un capteur / modèle). |
| `secondary` | string | Sous-texte (2ᵉ ligne). |
| `icon` | string | Icône `mdi:`. |
| `image` | string | Image (URL ou `/local/…`) — remplace l'icône. |
| `color` | string CSS | Couleur du texte / de l'icône. |
| `background` | string CSS | Couleur de fond de la ligne (et de l'en-tête quand l'option est sélectionnée). |
| `hide_label` | bool | Masque le texte (n'affiche que l'icône/image). |
| `tap_action` | objet action HA | Action au clic (voir « Actions »). |
| `entity` | string | Entité cible utilisée par certaines actions (`toggle`, `more-info`). |

### Valeur affichée quand la carte est repliée — priorité

1. `value_template` (si défini et non vide)
2. `entity` / `attribute`
3. Dernière option cliquée (mémorisée si `persist`)

Si la valeur résolue correspond au `value` (ou `label`) d'une option, la carte reprend **son icône et sa couleur**.

### Actions supportées (`tap_action`)

`more-info`, `navigate`, `url`, `toggle`, `call-service` / `perform-action`, `fire-dom-event`, `none`.
Toute autre action est transmise à l'API HA `hass-action` en dernier recours.

---

## Exemples

### Sélecteur de pièce avec scènes

```yaml
type: custom:custom-dropdown-card
title: "Ambiance"
icon: mdi:home
radius: 16
options:
  - label: "Salon"
    value: salon
    icon: mdi:sofa
    color: "#fff"
    background: "#c0392b"
    tap_action:
      action: call-service
      service: scene.turn_on
      target: { entity_id: scene.ambiance_salon }

  - label: "Cuisine"
    value: cuisine
    image: /local/images/cuisine.jpg
    tap_action:
      action: navigate
      navigation_path: /lovelace/cuisine
```

### Valeur repliée issue d'une clé imbriquée d'un attribut (modèle Jinja)

```yaml
type: custom:custom-dropdown-card
title: "Oscillation bureau"
value_template: >
  {{ state_attr("sensor.my_state_storage", "myDatas")["climate.bureau_v_swing"] }}
options:
  - label: "Activé"
    value: "on"
    icon: mdi:arrow-oscillating
    color: "#27ae60"
  - label: "Désactivé"
    value: "off"
    icon: mdi:stop
    color: "#c0392b"
```

### Colonne étroite, image seule, menu élargi

```yaml
type: custom:custom-dropdown-card
menu_width: 260px
hide_chevron: true
options:
  - value: cam1
    image: /local/cam1.jpg
    hide_label: true
  - value: cam2
    image: /local/cam2.jpg
    hide_label: true
```

---

## Dépannage

| Symptôme | Cause / solution |
|---|---|
| Une modif marche après Ctrl+Shift+R puis disparaît | Cache du service worker → **incrémente `?v=N`** sur la ressource, et/ou vide le cache (Profil → Vider le cache). |
| L'arrondi ne s'applique pas | Un thème / card-mod force `--ha-card-border-radius`. La carte utilise déjà `!important` ; inspecte l'élément `ha-card` pour voir la règle gagnante. |
| La valeur repliée ne s'affiche pas | Vérifie que le modèle Jinja renvoie bien une valeur (Outils de développement → Modèle) ou que l'entité existe. |
| La version en console n'est pas la bonne | Ancien fichier servi par le cache → voir « Mise à jour ». |

---

## Licence

Usage libre. Fourni tel quel, sans garantie.
