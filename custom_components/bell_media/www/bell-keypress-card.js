// bell-keypress-card.js v0.5.0
// MakerBell Media Cards - Single Key Button

class BellKeypressCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._api = null;
    this._rendered = false;
    this._pressTimer = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._api) {
      this._api = new window.BellMedia.API(hass);
    } else {
      this._api.hass = hass;
    }

    if (!this._rendered) {
      this._render();
      this._rendered = true;
    }
  }

  setConfig(config) {
    if (!config.character && !config.action) {
      throw new Error('bell-keypress-card requires character or action');
    }
    this._config = {
      character: config.character || '',
      action: config.action || null,
      label: config.label || null,
      buffer_key: config.buffer_key || window.BellMedia.DEFAULT_BUFFER_KEY,
      target_service: config.target_service || null,
      config_entry_id: config.config_entry_id || null,
      search_limit: config.search_limit || 20,
      ...config,
    };
  }

  getCardSize() {
    return 1;
  }

  static getStubConfig() {
    return { character: 'A' };
  }

  _getDisplayLabel() {
    if (this._config.label) return this._config.label;
    if (this._config.action === 'backspace') return '⌫';
    if (this._config.action === 'clear') return 'CLR';
    if (this._config.character === ' ') return 'SPC';
    return this._config.character || '';
  }

  async _onPress() {
    const BM = window.BellMedia;
    const key = this._config.buffer_key;
    let buffer = BM.getBuffer(key);
    const action = this._config.action;

    if (action === 'backspace') {
      buffer = buffer.slice(0, -1);
      BM.setBuffer(buffer, key);
    } else if (action === 'clear') {
      BM.clearBuffer(key);
      return;
    } else {
      buffer = buffer + this._config.character;
      BM.setBuffer(buffer, key);
    }

    // Highlight button
    const btn = this.shadowRoot?.querySelector('.key-btn');
    if (btn) {
      btn.classList.add('pressed');
      if (this._pressTimer) clearTimeout(this._pressTimer);
      this._pressTimer = setTimeout(() => btn.classList.remove('pressed'), 500);
    }

    // Trigger search on every keypress except space
    if (this._config.character !== ' ' && !action) {
      const query = BM.getBuffer(key).trim();
      if (query.length >= 2) {
        this._triggerSearch(query);
      }
    }

    // Also trigger search on backspace if remaining query is >= 2
    if (action === 'backspace') {
      const query = BM.getBuffer(key).trim();
      if (query.length >= 2) {
        this._triggerSearch(query);
      }
    }
  }

  async _triggerSearch(query) {
    if (!this._hass) return;
    try {
      await this._api.search(query, this._config.search_limit, this._config.config_entry_id);
    } catch (e) {
      console.error('Bell Keypress: Search failed:', e);
    }
  }

  _render() {
    const label = this._getDisplayLabel();
    const isAction = !!this._config.action;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .key-btn {
          width: 100%;
          padding: 12px 0;
          text-align: center;
          font-size: 15px;
          font-family: var(--ha-card-header-font-family, inherit);
          font-weight: 400;
          color: var(--primary-text-color, #fff);
          background: rgba(255,255,255,0.1);
          border: none;
          border-radius: 6px;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          transition: background 0.1s, transform 0.1s;
          line-height: 1;
        }
        .key-btn:active {
          background: rgba(255,255,255,0.25);
          transform: scale(0.95);
        }
        .key-btn.pressed {
          background: var(--accent-color, #e8952f);
          color: #fff;
        }
        .key-btn.action-key {
          background: rgba(255,255,255,0.15);
          color: var(--secondary-text-color, rgba(255,255,255,0.7));
          font-size: 12px;
        }
        .key-btn.action-key.pressed {
          background: var(--accent-color, #e8952f);
          color: #fff;
        }
      </style>
      <button class="key-btn ${isAction ? 'action-key' : ''}">${label}</button>
    `;

    this.shadowRoot.querySelector('.key-btn')
      ?.addEventListener('click', () => this._onPress());
  }
}

customElements.define('bell-keypress-card', BellKeypressCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'bell-keypress-card',
  name: 'Bell Keypress Card',
  description: 'Single keyboard button for Music Assistant search',
});

console.info('%c BELL-KEYPRESS-CARD %c v0.5.0 ', 'background:#e8952f;color:#fff;font-weight:bold;', 'background:#333;color:#fff;');
