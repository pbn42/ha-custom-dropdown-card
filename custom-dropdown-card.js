/**
 * Custom Dropdown Card pour Home Assistant
 * ----------------------------------------
 * Liste déroulante 100% personnalisable : texte, image, icône, couleur, action.
 * Repliée, elle affiche la dernière valeur cliquée (ou la valeur d'un capteur).
 *
 * Installation :
 *   1. Copier ce fichier dans /config/www/custom-dropdown-card.js
 *   2. Paramètres > Tableaux de bord > (⋮) Ressources > Ajouter une ressource
 *        URL : /local/custom-dropdown-card.js
 *        Type : Module JavaScript
 *   3. Utiliser `type: custom:custom-dropdown-card` dans une carte.
 *
 * Auteur : généré pour finance@lmcinema.com
 */

const VERSION = "1.7.1";

class CustomDropdownCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._open = false;
    this._selected = null; // { option } dernière valeur cliquée (persistée en mémoire)
    this._built = false;
    this._boundOutside = this._handleOutsideClick.bind(this);
  }

  // ---- Configuration -------------------------------------------------------
  setConfig(config) {
    if (!config.options || !Array.isArray(config.options)) {
      throw new Error("La clé `options` (liste) est obligatoire.");
    }
    this._config = {
      // Les clés brutes d'abord (laisse passer value_template, type, etc.) ;
      // les défauts normalisés ci-dessous PRIMENT pour éviter qu'un `undefined`
      // renvoyé par l'éditeur n'écrase une valeur par défaut valide.
      ...config,
      title: config.title || "",
      icon: config.icon || null,          // icône par défaut de l'en-tête
      entity: config.entity || null,       // capteur source pour la valeur repliée
      attribute: config.attribute || null, // attribut du capteur (sinon état)
      placeholder: config.placeholder || "Sélectionner…",
      persist: config.persist !== false,   // mémoriser la dernière sélection
      close_on_select: config.close_on_select !== false,
      hide_chevron: config.hide_chevron === true, // masquer la flèche de dépliage
      menu_width: config.menu_width || null,       // largeur du menu déplié (CSS)
      background: config.background || null,
      radius: config.radius != null ? config.radius : 12,
      options: config.options,
    };
    this._built = false;
    // Restaure la dernière sélection persistée pour cette carte
    if (this._config.persist) {
      const saved = this._loadPersisted();
      if (saved) this._selected = saved;
    }
    this._render();
    this._maybeSubscribeTemplate();
  }

  static getConfigElement() {
    return document.createElement("custom-dropdown-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Ma liste",
      icon: "mdi:format-list-bulleted",
      options: [
        { label: "Salon", value: "salon", icon: "mdi:sofa", color: "#f39c12" },
        { label: "Cuisine", value: "cuisine", icon: "mdi:silverware-fork-knife", color: "#27ae60" },
        { label: "Chambre", value: "chambre", icon: "mdi:bed", color: "#8e44ad" },
      ],
    };
  }

  // ---- hass ---------------------------------------------------------------
  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._render();
    this._maybeSubscribeTemplate();
    this._updateCollapsedValue();
  }

  // ---- Rendu du modèle Jinja (value_template) -----------------------------
  _maybeSubscribeTemplate() {
    const tpl = this._config && this._config.value_template;
    // Déjà abonné au bon template : rien à faire
    if (tpl && tpl === this._subscribedTemplate && this._unsubTemplate) return;

    // Désabonnement de l'ancien
    if (this._unsubTemplate) {
      Promise.resolve(this._unsubTemplate).then((u) => { try { u(); } catch (e) {} });
      this._unsubTemplate = null;
    }
    this._subscribedTemplate = null;
    this._templateResult = undefined;

    if (!tpl || !this._hass || !this._hass.connection) return;

    this._subscribedTemplate = tpl;
    this._unsubTemplate = this._hass.connection.subscribeMessage(
      (msg) => {
        this._templateResult = msg.result;
        this._updateCollapsedValue();
      },
      { type: "render_template", template: tpl }
    );
    // subscribeMessage renvoie une Promise<unsub> ; on gère un éventuel échec
    Promise.resolve(this._unsubTemplate).catch(() => {
      this._subscribedTemplate = null;
      this._unsubTemplate = null;
    });
  }

  get _persistKey() {
    return "cdc:" + (this._config.title || "") + ":" + JSON.stringify(this._config.options.map(o => o.value ?? o.label));
  }

  _loadPersisted() {
    try {
      const raw = localStorage.getItem(this._persistKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  _savePersisted(option) {
    try { localStorage.setItem(this._persistKey, JSON.stringify(option)); } catch (e) {}
  }

  // ---- Valeur affichée quand la liste est repliée -------------------------
  _resolveCollapsedOption() {
    // 0) Priorité au modèle Jinja si configuré (valeur rendue par HA)
    if (this._config.value_template) {
      const val = this._templateResult;
      if (val != null && val !== "") {
        const match = this._config.options.find(
          (o) => String(o.value ?? o.label) === String(val)
        );
        if (match) return match;
        return { label: String(val), _fromTemplate: true };
      }
    }
    // 1) Priorité au capteur si configuré
    if (this._config.entity && this._hass) {
      const st = this._hass.states[this._config.entity];
      if (st) {
        const val = this._config.attribute
          ? st.attributes[this._config.attribute]
          : st.state;
        // Cherche une option correspondante pour récupérer icône/couleur
        const match = this._config.options.find(
          (o) => String(o.value ?? o.label) === String(val)
        );
        if (match) return match;
        return { label: this._formatState(st, val), icon: st.attributes.icon, _fromEntity: true };
      }
    }
    // 2) Sinon dernière valeur cliquée
    if (this._selected) return this._selected;
    return null;
  }

  _formatState(stateObj, val) {
    if (this._hass && this._hass.formatEntityState && !this._config.attribute) {
      try { return this._hass.formatEntityState(stateObj); } catch (e) {}
    }
    return val;
  }

  _updateCollapsedValue() {
    if (!this.shadowRoot) return;
    const valueEl = this.shadowRoot.querySelector(".value");
    const iconEl = this.shadowRoot.querySelector(".header-icon");
    const imgEl = this.shadowRoot.querySelector(".header-image");
    if (!valueEl) return;

    const opt = this._resolveCollapsedOption();

    // Fond de l'en-tête : reprend celui de l'option sélectionnée (si défini)
    const headerEl = this.shadowRoot.querySelector(".header");
    if (headerEl) headerEl.style.background = (opt && opt.background) || "";

    if (opt) {
      const showLabel = !opt.hide_label;
      valueEl.textContent = showLabel ? (opt.label ?? opt.value ?? "") : "";
      valueEl.classList.remove("placeholder");
      if (opt.color) valueEl.style.color = opt.color; else valueEl.style.color = "";
    } else {
      valueEl.textContent = this._config.placeholder;
      valueEl.classList.add("placeholder");
      valueEl.style.color = "";
    }

    // Icône / image d'en-tête : celle de l'option sélectionnée, sinon icône par défaut
    const icon = (opt && opt.icon) || this._config.icon;
    const image = opt && opt.image;
    if (imgEl && iconEl) {
      if (image) {
        imgEl.style.backgroundImage = `url("${image}")`;
        imgEl.style.display = "block";
        iconEl.style.display = "none";
      } else if (icon) {
        iconEl.setAttribute("icon", icon);
        iconEl.style.display = "block";
        iconEl.style.color = (opt && opt.color) || "";
        imgEl.style.display = "none";
      } else {
        iconEl.style.display = "none";
        imgEl.style.display = "none";
      }
    }
  }

  // ---- Rendu --------------------------------------------------------------
  _render() {
    if (!this._config) return;
    const c = this._config;
    // Largeur du menu déplié : nombre => px, sinon valeur CSS telle quelle
    const mw = c.menu_width == null
      ? null
      : (typeof c.menu_width === "number" ? c.menu_width + "px" : c.menu_width);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          overflow: visible;
          ${c.background ? `background:${c.background};` : ""}
          --ha-card-border-radius: ${c.radius}px;
          border-radius: ${c.radius}px !important;
        }
        .wrapper { position: relative; }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          cursor: pointer;
          user-select: none;
          border-radius: ${c.radius}px;
        }
        .header-icon, .header-image {
          width: 28px; height: 28px;
          flex: 0 0 auto;
          border-radius: 6px;
        }
        .header-image { background-size: cover; background-position: center; display:none; }
        .titles { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
        .title { font-size: 0.8rem; color: var(--secondary-text-color); }
        .value { font-size: 1.05rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .value.placeholder { color: var(--disabled-text-color); font-weight: 400; }
        .chevron {
          flex: 0 0 auto;
          transition: transform 0.25s ease;
          color: var(--secondary-text-color);
        }
        :host([open]) .chevron { transform: rotate(180deg); }

        .menu {
          position: absolute;
          left: 0;
          ${mw ? `right: auto; width: ${mw}; min-width: ${mw};` : "right: 0;"}
          top: 100%;
          z-index: 20;
          background: var(--card-background-color, #fff);
          border-radius: ${c.radius}px;
          box-shadow: var(--ha-card-box-shadow, 0 8px 24px rgba(0,0,0,0.25));
          margin-top: 4px;
          padding: 6px;
          max-height: 320px;
          overflow-y: auto;
          scrollbar-gutter: stable;
          opacity: 0;
          transform: translateY(-6px);
          pointer-events: none;
          transition: opacity 0.18s ease, transform 0.18s ease;
        }
        :host([open]) .menu {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.12s ease;
        }
        .option:hover { background: var(--secondary-background-color); }
        .option.selected { background: var(--secondary-background-color); }
        .option.selected::after {
          content: "";
          margin-left: auto;
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--primary-color);
        }
        .opt-icon, .opt-image {
          width: 24px; height: 24px; flex: 0 0 auto; border-radius: 6px;
        }
        .opt-image { background-size: cover; background-position: center; }
        .opt-label { font-size: 0.98rem; }
        .opt-secondary { font-size: 0.78rem; color: var(--secondary-text-color); }
        .opt-texts { display:flex; flex-direction:column; min-width:0; }
      </style>

      <ha-card>
        <div class="wrapper">
          <div class="header" part="header">
            <ha-icon class="header-icon"></ha-icon>
            <div class="header-image"></div>
            <div class="titles">
              ${c.title ? `<span class="title">${c.title}</span>` : ""}
              <span class="value placeholder">${c.placeholder}</span>
            </div>
            ${c.hide_chevron ? "" : `<ha-icon class="chevron" icon="mdi:chevron-down"></ha-icon>`}
          </div>
          <div class="menu">
            ${c.options.map((o, i) => this._optionHtml(o, i)).join("")}
          </div>
        </div>
      </ha-card>
    `;

    // Événements
    this.shadowRoot.querySelector(".header").addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggle();
    });

    this.shadowRoot.querySelectorAll(".option").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(el.dataset.index);
        this._onSelect(this._config.options[idx]);
      });
    });

    this._built = true;
    this._updateCollapsedValue();
  }

  _optionHtml(o, i) {
    const isSel =
      this._selected &&
      String(this._selected.value ?? this._selected.label) === String(o.value ?? o.label);
    const showLabel = !o.hide_label;
    const style = o.color ? `color:${o.color};` : "";
    const rowStyle = o.background ? `background:${o.background};` : "";
    let media = "";
    if (o.image) {
      media = `<div class="opt-image" style="background-image:url('${o.image}')"></div>`;
    } else if (o.icon) {
      media = `<ha-icon class="opt-icon" icon="${o.icon}" style="${o.color ? `color:${o.color}` : ""}"></ha-icon>`;
    }
    const texts = showLabel
      ? `<div class="opt-texts">
          <span class="opt-label" style="${style}">${o.label ?? o.value ?? ""}</span>
          ${o.secondary ? `<span class="opt-secondary">${o.secondary}</span>` : ""}
        </div>`
      : "";
    return `
      <div class="option ${isSel ? "selected" : ""}" data-index="${i}" style="${rowStyle}">
        ${media}
        ${texts}
      </div>
    `;
  }

  // ---- Interactions -------------------------------------------------------
  _toggle() {
    this._open ? this._close() : this._openMenu();
  }

  _openMenu() {
    this._open = true;
    this.setAttribute("open", "");
    // Fermeture au clic extérieur
    setTimeout(() => document.addEventListener("click", this._boundOutside), 0);
  }

  _close() {
    this._open = false;
    this.removeAttribute("open");
    document.removeEventListener("click", this._boundOutside);
  }

  _handleOutsideClick(e) {
    // e.composedPath() gère le Shadow DOM ; on ne ferme que si le clic
    // est réellement en dehors de la carte.
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(this)) this._close();
  }

  _onSelect(option) {
    // Mémorise la dernière valeur cliquée
    this._selected = option;
    if (this._config.persist) this._savePersisted(option);

    // Met à jour l'état visuel des options
    this.shadowRoot.querySelectorAll(".option").forEach((el) => {
      const idx = Number(el.dataset.index);
      const o = this._config.options[idx];
      const sel = String(o.value ?? o.label) === String(option.value ?? option.label);
      el.classList.toggle("selected", sel);
    });

    this._updateCollapsedValue();

    if (this._config.close_on_select) this._close();

    // Exécute l'action associée
    const action = option.tap_action || option.action;
    if (action) this._runAction(action, option);
  }

  // ---- Gestion des actions Home Assistant ---------------------------------
  _runAction(action, option) {
    if (!action) return;
    const type = typeof action === "string" ? action : action.action;

    switch (type) {
      case "more-info": {
        const entityId = action.entity || option.entity || this._config.entity;
        if (entityId) this._fire("hass-more-info", { entityId });
        break;
      }
      case "navigate": {
        if (action.navigation_path) {
          history.pushState(null, "", action.navigation_path);
          this._fire("location-changed", { replace: false }, window);
        }
        break;
      }
      case "url": {
        if (action.url_path) window.open(action.url_path, action.new_tab === false ? "_self" : "_blank");
        break;
      }
      case "toggle": {
        const entityId = action.entity || option.entity;
        if (entityId && this._hass) {
          this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
        }
        break;
      }
      case "call-service":
      case "perform-action": {
        const svc = action.service || action.perform_action;
        if (svc && this._hass) {
          const [domain, service] = svc.split(".");
          this._hass.callService(domain, service, {
            ...(action.data || action.service_data || {}),
          }, action.target || undefined);
        }
        break;
      }
      case "fire-dom-event": {
        this._fire("ll-custom", action);
        break;
      }
      case "none":
        break;
      default:
        // Action brute passée à l'API hass-action si dispo
        this._fire("hass-action", { config: { tap_action: action }, action: "tap" });
    }
  }

  _fire(type, detail, node) {
    const event = new Event(type, { bubbles: true, cancelable: false, composed: true });
    event.detail = detail || {};
    (node || this).dispatchEvent(event);
    return event;
  }

  disconnectedCallback() {
    document.removeEventListener("click", this._boundOutside);
    if (this._unsubTemplate) {
      Promise.resolve(this._unsubTemplate).then((u) => { try { u(); } catch (e) {} });
      this._unsubTemplate = null;
      this._subscribedTemplate = null;
    }
  }

  getCardSize() {
    return 1;
  }
}

customElements.define("custom-dropdown-card", CustomDropdownCard);

/* =========================================================================
 * ÉDITEUR GRAPHIQUE
 * =======================================================================*/
class CustomDropdownCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._forms = [];       // références ha-form des options (pour maj hass)
    this._mainForm = null;
    this._built = false;
  }

  setConfig(config) {
    const normalized = { options: [], ...config };
    if (!Array.isArray(normalized.options)) normalized.options = [];

    // Home Assistant renvoie la config via setConfig après chaque `config-changed`.
    // Si seule une valeur a changé (même nombre d'options), on met à jour les
    // formulaires existants au lieu de reconstruire le DOM : les panneaux
    // ouverts et le focus (ex: saisie d'un code couleur) sont préservés.
    const sameStructure =
      this._built &&
      this._config &&
      Array.isArray(this._config.options) &&
      this._config.options.length === normalized.options.length;

    this._config = normalized;

    if (sameStructure) {
      this._syncForms();
      this._updatePreview();
    } else {
      this._render();
    }
  }

  // Met à jour les données des ha-form sans reconstruire le DOM.
  _syncForms() {
    if (this._mainForm) this._mainForm.data = this._config;
    this._forms.forEach((f, i) => {
      if (this._config.options[i]) f.data = this._config.options[i];
    });
  }

  set hass(hass) {
    this._hass = hass;
    if (this._mainForm) this._mainForm.hass = hass;
    this._forms.forEach((f) => (f.hass = hass));
    if (this._preview) this._preview.hass = hass;
  }

  _updatePreview() {
    if (!this._preview) return;
    try {
      this._preview.setConfig(this._config);
      if (this._hass) this._preview.hass = this._hass;
    } catch (e) {
      /* config transitoire invalide pendant la saisie : on ignore */
    }
  }

  // ---- Schémas ha-form ----------------------------------------------------
  get _mainSchema() {
    return [
      { name: "title", selector: { text: {} } },
      { type: "grid", name: "", schema: [
        { name: "icon", selector: { icon: {} } },
        { name: "placeholder", selector: { text: {} } },
      ]},
      { type: "grid", name: "", schema: [
        { name: "entity", selector: { entity: {} } },
        { name: "attribute", selector: { text: {} } },
      ]},
      { name: "value_template", selector: { template: {} } },
      { type: "grid", name: "", schema: [
        { name: "background", selector: { text: {} } },
        { name: "radius", selector: { number: { min: 0, max: 40, mode: "box" } } },
      ]},
      { name: "menu_width", selector: { text: {} } },
      { type: "grid", name: "", schema: [
        { name: "persist", selector: { boolean: {} } },
        { name: "close_on_select", selector: { boolean: {} } },
      ]},
      { name: "hide_chevron", selector: { boolean: {} } },
    ];
  }

  get _optionSchema() {
    return [
      { type: "grid", name: "", schema: [
        { name: "label", selector: { text: {} } },
        { name: "value", selector: { text: {} } },
      ]},
      { name: "secondary", selector: { text: {} } },
      { type: "grid", name: "", schema: [
        { name: "icon", selector: { icon: {} } },
        { name: "color", selector: { text: {} } },
      ]},
      { type: "grid", name: "", schema: [
        { name: "background", selector: { text: {} } },
        { name: "hide_label", selector: { boolean: {} } },
      ]},
      { name: "image", selector: { text: {} } },
      { name: "tap_action", selector: { ui_action: {} } },
    ];
  }

  _label(name) {
    const map = {
      title: "Titre",
      icon: "Icône par défaut",
      placeholder: "Texte par défaut (vide)",
      entity: "Capteur source (valeur repliée)",
      attribute: "Attribut du capteur (optionnel)",
      value_template: "Modèle Jinja (valeur repliée, prioritaire)",
      radius: "Arrondi (px)",
      menu_width: "Largeur du menu déplié (ex: 260px, 130%)",
      persist: "Mémoriser la sélection",
      close_on_select: "Refermer après clic",
      hide_chevron: "Masquer la flèche de dépliage",
      label: "Texte",
      value: "Valeur",
      secondary: "Sous-texte",
      color: "Couleur du texte (ex: #ff0000)",
      background: "Couleur de fond (ex: #222 / rgba(...))",
      hide_label: "Masquer le texte",
      image: "Image (URL / /local/…)",
      tap_action: "Action au clic",
    };
    return map[name] || name;
  }

  // ---- Fabrique de ha-form ------------------------------------------------
  _makeForm(data, schema, onChange) {
    const form = document.createElement("ha-form");
    form.hass = this._hass;
    form.data = data;
    form.schema = schema;
    form.computeLabel = (s) => this._label(s.name);
    form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      onChange(ev.detail.value);
    });
    return form;
  }

  // ---- Mutations ----------------------------------------------------------
  _emit() {
    const ev = new Event("config-changed", { bubbles: true, composed: true });
    ev.detail = { config: this._config };
    this.dispatchEvent(ev);
  }

  _updateMain(value) {
    // Conserve les options gérées à part
    this._config = { ...this._config, ...value, options: this._config.options };
    this._emit();
    this._updatePreview();
  }

  _updateOption(index, value) {
    const options = this._config.options.slice();
    options[index] = { ...options[index], ...value };
    this._config = { ...this._config, options };
    this._emit();
    this._updatePreview();
  }

  _addOption() {
    const options = this._config.options.slice();
    options.push({ label: "Nouvelle option", value: "option_" + (options.length + 1), icon: "mdi:circle" });
    this._config = { ...this._config, options };
    this._render();
    this._emit();
  }

  _removeOption(index) {
    const options = this._config.options.slice();
    options.splice(index, 1);
    this._config = { ...this._config, options };
    this._render();
    this._emit();
  }

  _moveOption(index, dir) {
    const options = this._config.options.slice();
    const target = index + dir;
    if (target < 0 || target >= options.length) return;
    [options[index], options[target]] = [options[target], options[index]];
    this._config = { ...this._config, options };
    this._render();
    this._emit();
  }

  // ---- Rendu --------------------------------------------------------------
  _render() {
    if (!this._config) return;
    this._forms = [];
    this.shadowRoot.innerHTML = `
      <style>
        .editor { display: flex; flex-direction: column; gap: 16px; }
        .section-title { font-weight: 600; margin: 4px 0; font-size: 0.95rem; }
        .preview-wrap {
          border: 1px dashed var(--divider-color);
          border-radius: 10px;
          padding: 12px;
          background: var(--secondary-background-color);
        }
        .preview { margin-top: 8px; }
        .options { display: flex; flex-direction: column; gap: 8px; }
        ha-expansion-panel { --expansion-panel-content-padding: 0 12px 12px; border:1px solid var(--divider-color); border-radius: 8px; }
        .panel-header { display: flex; align-items: center; gap: 8px; }
        .panel-header ha-icon { color: var(--secondary-text-color); }
        .opt-toolbar { display: flex; gap: 4px; justify-content: flex-end; padding-top: 8px; }
        button.tool {
          background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px;
          color: var(--secondary-text-color); display: inline-flex;
        }
        button.tool:hover { background: var(--secondary-background-color); }
        button.tool.danger:hover { color: var(--error-color); }
        .add {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--primary-color); color: var(--text-primary-color, #fff);
          border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 0.9rem;
          align-self: flex-start;
        }
        .add:hover { opacity: 0.9; }
      </style>
      <div class="editor">
        <div class="preview-wrap">
          <div class="section-title">Aperçu en direct</div>
          <div class="preview" id="preview"></div>
        </div>
        <div class="main"></div>
        <div class="section-title">Options de la liste (${this._config.options.length})</div>
        <div class="options"></div>
        <button class="add" id="add"><ha-icon icon="mdi:plus"></ha-icon>Ajouter une option</button>
      </div>
    `;

    // Aperçu : instance réelle de la carte, mise à jour à chaque changement
    this._preview = document.createElement("custom-dropdown-card");
    try {
      this._preview.setConfig(this._config);
      if (this._hass) this._preview.hass = this._hass;
    } catch (e) {}
    this.shadowRoot.getElementById("preview").appendChild(this._preview);

    // Formulaire principal
    this._mainForm = this._makeForm(
      this._config,
      this._mainSchema,
      (v) => this._updateMain(v)
    );
    this.shadowRoot.querySelector(".main").appendChild(this._mainForm);

    // Panneaux d'options
    const list = this.shadowRoot.querySelector(".options");
    this._config.options.forEach((opt, i) => {
      const panel = document.createElement("ha-expansion-panel");
      panel.outlined = true;

      const header = document.createElement("div");
      header.className = "panel-header";
      header.setAttribute("slot", "header");
      const hicon = document.createElement("ha-icon");
      hicon.icon = opt.icon || "mdi:circle-outline";
      const htext = document.createElement("span");
      htext.textContent = opt.label || opt.value || "Option " + (i + 1);
      header.appendChild(hicon);
      header.appendChild(htext);
      panel.appendChild(header);

      const form = this._makeForm(opt, this._optionSchema, (v) => {
        this._updateOption(i, v);
        // met à jour l'en-tête du panneau à la volée
        htext.textContent = v.label || v.value || "Option " + (i + 1);
        hicon.icon = v.icon || "mdi:circle-outline";
      });
      this._forms.push(form);
      panel.appendChild(form);

      const toolbar = document.createElement("div");
      toolbar.className = "opt-toolbar";
      toolbar.innerHTML = `
        <button class="tool" data-act="up"    title="Monter"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="tool" data-act="down"  title="Descendre"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        <button class="tool danger" data-act="del" title="Supprimer"><ha-icon icon="mdi:delete"></ha-icon></button>
      `;
      toolbar.querySelector('[data-act="up"]').addEventListener("click", () => this._moveOption(i, -1));
      toolbar.querySelector('[data-act="down"]').addEventListener("click", () => this._moveOption(i, 1));
      toolbar.querySelector('[data-act="del"]').addEventListener("click", () => this._removeOption(i));
      panel.appendChild(toolbar);

      list.appendChild(panel);
    });

    this.shadowRoot.getElementById("add").addEventListener("click", () => this._addOption());
    this._built = true;
  }
}

customElements.define("custom-dropdown-card-editor", CustomDropdownCardEditor);

// Référencement dans le sélecteur de cartes de l'UI
window.customCards = window.customCards || [];
window.customCards.push({
  type: "custom-dropdown-card",
  name: "Custom Dropdown Card",
  description: "Liste déroulante 100% personnalisable (texte, image, icône, couleur, action).",
  preview: true,
});

console.info(
  `%c CUSTOM-DROPDOWN-CARD %c v${VERSION} `,
  "color:white;background:#3498db;font-weight:700",
  "color:#3498db;background:white;font-weight:700"
);
