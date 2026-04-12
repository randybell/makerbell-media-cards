// bell-media-cards.js v0.4.0
// MakerBell Media Cards for Music Assistant

// ============================================
// Active player - per browser tab
// ============================================

const BELL_STORAGE_KEY = 'bell_media_active_player';

function bellGetActivePlayer() {
  return sessionStorage.getItem(BELL_STORAGE_KEY) || null;
}

function bellSetActivePlayer(playerName) {
  sessionStorage.setItem(BELL_STORAGE_KEY, playerName);
  window.dispatchEvent(new CustomEvent('bell-active-player-changed', {
    detail: { player: playerName },
  }));
}


// ============================================
// Shared service helper
// ============================================

class BellMediaAPI {
  constructor(hass) {
    this._hass = hass;
  }

  set hass(hass) {
    this._hass = hass;
  }

  async callService(domain, service, data) {
    return this._hass.callService(domain, service, data);
  }

  async callBellService(service, data) {
    return this._hass.connection.sendMessagePromise({
      type: 'call_service',
      domain: 'bell_media',
      service: service,
      service_data: data || {},
      return_response: true,
    });
  }

  async getPlayers() {
    const result = await this.callBellService('get_players');
    return result?.response?.players || [];
  }

  async getQueueItems(queueId, limit, offset) {
    const result = await this.callBellService('get_queue_items', {
      queue_id: queueId,
      limit: limit || 50,
      offset: offset || 0,
    });
    return result?.response?.items || [];
  }

  async getQueue(queueId) {
    const result = await this.callBellService('get_queue', {
      queue_id: queueId,
    });
    return result?.response?.queue || null;
  }

  async sendCommand(command, args) {
    const result = await this.callBellService('send_command', {
      command: command,
      args: args || {},
    });
    return result?.response?.result || null;
  }
}


// ============================================
// Shared styles
// ============================================

const BELL_SHARED_STYLES = `
  :host {
    display: block;
    font-family: var(--ha-card-header-font-family, inherit);
  }
  .bell-card {
    padding: 16px;
  }
  .bell-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
  }
  .bell-icon-btn {
    background: none;
    border: none;
    color: var(--primary-text-color);
    cursor: pointer;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .bell-icon-btn:hover {
    background: var(--secondary-background-color, rgba(255,255,255,0.1));
  }
  .bell-icon-btn.active {
    color: var(--accent-color, #e8952f);
  }
  .bell-icon-btn.muted {
    color: var(--disabled-text-color, #888);
  }
  .bell-slider-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bell-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: var(--disabled-text-color, #444);
    outline: none;
  }
  .bell-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent-color, #e8952f);
    cursor: pointer;
  }
  .bell-vol-pct {
    font-size: 12px;
    color: var(--secondary-text-color);
    min-width: 32px;
    text-align: right;
  }
  .bell-name {
    font-size: 14px;
    color: var(--primary-text-color);
    min-width: 100px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bell-dropdown {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--divider-color, #333);
    background: var(--card-background-color, #1c1c1c);
    color: var(--primary-text-color);
    font-size: 14px;
    font-family: inherit;
    margin-bottom: 12px;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }
  .bell-section-label {
    font-size: 12px;
    color: var(--secondary-text-color);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 0 4px;
  }
`;


// ============================================
// SVG Icons
// ============================================

const ICONS = {
  speaker: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>',
  mute: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
  unmute: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
  unlink: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.3 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16zM2 4.27l3.11 3.11A4.991 4.991 0 0 0 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4L20 19.74 3.27 3 2 4.27z"/></svg>',
};


// ============================================
// bell-speaker-card
// ============================================

class BellSpeakerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._api = null;
    this._rendered = false;
    this._players = [];
    this._boundOnActiveChange = this._onExternalActiveChange.bind(this);
  }

  connectedCallback() {
    window.addEventListener('bell-active-player-changed', this._boundOnActiveChange);
  }

  disconnectedCallback() {
    window.removeEventListener('bell-active-player-changed', this._boundOnActiveChange);
  }

  _onExternalActiveChange(e) {
    const dropdown = this.shadowRoot.querySelector('.bell-dropdown');
    if (dropdown && dropdown.value !== e.detail.player) {
      dropdown.value = e.detail.player;
    }
    this._renderPlayers();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._api) {
      this._api = new BellMediaAPI(hass);
    } else {
      this._api.hass = hass;
    }

    if (!this._rendered) {
      this._render();
      this._rendered = true;
      this._loadPlayers();
    }

    this._updatePlayerRows();
  }

  setConfig(config) {
    this._config = {
      exclude_players: config.exclude_players || [],
      card_height: config.card_height || null,
      ...config,
    };
  }

  getCardSize() {
    return 6;
  }

  static getStubConfig() {
    return {};
  }

  async _loadPlayers() {
    try {
      const players = await this._api.getPlayers();
      this._players = players;
      this._renderPlayers();
    } catch (e) {
      console.error('Bell: Failed to load players:', e);
    }
  }

  _getFilteredPlayers() {
    const exclude = this._config.exclude_players || [];
    return this._players.filter(p => {
      const id = p.player_id || '';
      const name = p.display_name || p.name || '';
      return !exclude.includes(id) && !exclude.includes(name);
    });
  }

  _updatePlayerRows() {
    const players = this._getFilteredPlayers();
    players.forEach(player => {
      const id = player.player_id;
      const entityId = this._findMediaPlayerEntity(id);
      if (!entityId) return;

      const state = this._hass.states[entityId];
      if (!state) return;

      const vol = Math.round((state.attributes.volume_level || 0) * 100);
      const muted = state.attributes.is_volume_muted || false;

      const slider = this.shadowRoot.querySelector(`input[data-player="${id}"]`);
      const pct = this.shadowRoot.querySelector(`.pct-${CSS.escape(id)}`);
      const muteBtn = this.shadowRoot.querySelector(`.mute-${CSS.escape(id)}`);

      if (slider && parseInt(slider.value) !== vol) {
        slider.value = vol;
      }
      if (pct) pct.textContent = `${vol}%`;
      if (muteBtn) {
        muteBtn.innerHTML = muted ? ICONS.mute : ICONS.unmute;
        muteBtn.classList.toggle('muted', muted);
      }
    });
  }

  _findMediaPlayerEntity(playerId) {
    for (const entityId of Object.keys(this._hass.states)) {
      if (!entityId.startsWith('media_player.')) continue;
      const state = this._hass.states[entityId];
      if (state.attributes.mass_player_id === playerId) return entityId;
    }
    return null;
  }

  async _onActivePlayerChange(e) {
    bellSetActivePlayer(e.target.value);
    this._renderPlayers();
  }

  async _onMuteToggle(playerId) {
    const entityId = this._findMediaPlayerEntity(playerId);
    if (!entityId) return;
    const state = this._hass.states[entityId];
    const muted = state?.attributes?.is_volume_muted || false;
    await this._api.callService('media_player', 'volume_mute', {
      entity_id: entityId,
      is_volume_muted: !muted,
    });
  }

  async _onVolumeChange(playerId, value) {
    const entityId = this._findMediaPlayerEntity(playerId);
    if (!entityId) return;
    await this._api.callService('media_player', 'volume_set', {
      entity_id: entityId,
      volume_level: value / 100,
    });
  }

  async _onJoinToggle(playerId) {
    const activeName = bellGetActivePlayer();
    if (!activeName) return;

    const activePlayer = this._players.find(p =>
      (p.display_name || p.name) === activeName
    );
    if (!activePlayer) return;

    const player = this._players.find(p => p.player_id === playerId);
    if (!player) return;

    const isSynced = player.synced_to === activePlayer.player_id ||
      (activePlayer.group_childs && activePlayer.group_childs.includes(playerId));

    try {
      if (isSynced) {
        await this._api.sendCommand('players/cmd/unsync', {
          player_id: playerId,
        });
      } else {
        await this._api.sendCommand('players/cmd/sync', {
          player_id: playerId,
          target_player: activePlayer.player_id,
        });
      }
      setTimeout(() => this._loadPlayers(), 500);
    } catch (e) {
      console.error('Bell: Join/unjoin failed:', e);
    }
  }

  _renderPlayers() {
    const container = this.shadowRoot.querySelector('.players-list');
    const dropdown = this.shadowRoot.querySelector('.bell-dropdown');
    if (!container || !dropdown) return;

    const players = this._getFilteredPlayers();
    const activeName = bellGetActivePlayer();

    dropdown.innerHTML = players.map(p => {
      const name = p.display_name || p.name || p.player_id;
      return `<option value="${name}" ${name === activeName ? 'selected' : ''}>${name}</option>`;
    }).join('');

    if (!activeName && players.length > 0) {
      const firstName = players[0].display_name || players[0].name;
      bellSetActivePlayer(firstName);
    }

    const activePlayer = this._players.find(p =>
      (p.display_name || p.name) === (activeName || '')
    );
    const activeId = activePlayer?.player_id;

    container.innerHTML = players.map(player => {
      const id = player.player_id;
      const name = player.display_name || player.name || id;
      const safeId = CSS.escape(id);
      const isSynced = player.synced_to === activeId ||
        (activePlayer?.group_childs && activePlayer.group_childs.includes(id));
      const isActive = id === activeId;

      return `
        <div class="bell-row">
          <button class="bell-icon-btn mute-${safeId}" data-action="mute" data-player="${id}">
            ${ICONS.unmute}
          </button>
          <span class="bell-name">${name}</span>
          <div class="bell-slider-wrap">
            <input type="range" class="bell-slider" min="0" max="100" value="0"
              data-player="${id}" data-action="volume" />
            <span class="bell-vol-pct pct-${safeId}">0%</span>
          </div>
          ${isActive ? '' : `
            <button class="bell-icon-btn ${isSynced ? 'active' : ''}"
              data-action="join" data-player="${id}"
              title="${isSynced ? 'Leave group' : 'Join group'}">
              ${isSynced ? ICONS.link : ICONS.unlink}
            </button>
          `}
        </div>`;
    }).join('');

    container.querySelectorAll('[data-action="mute"]').forEach(btn => {
      btn.addEventListener('click', () => this._onMuteToggle(btn.dataset.player));
    });

    container.querySelectorAll('[data-action="volume"]').forEach(slider => {
      slider.addEventListener('change', (e) => {
        this._onVolumeChange(slider.dataset.player, parseInt(e.target.value));
      });
    });

    container.querySelectorAll('[data-action="join"]').forEach(btn => {
      btn.addEventListener('click', () => this._onJoinToggle(btn.dataset.player));
    });

    this._updatePlayerRows();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>${BELL_SHARED_STYLES}</style>
      <ha-card>
        <div class="bell-card">
          <select class="bell-dropdown"></select>
          <div class="bell-section-label">Speakers</div>
          <div class="players-list"
            ${this._config.card_height ? `style="max-height:${this._config.card_height}px;overflow-y:auto;"` : ''}>
          </div>
        </div>
      </ha-card>
    `;

    this.shadowRoot.querySelector('.bell-dropdown')
      ?.addEventListener('change', (e) => this._onActivePlayerChange(e));
  }
}


// ============================================
// Register all cards
// ============================================

customElements.define('bell-speaker-card', BellSpeakerCard);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: 'bell-speaker-card',
    name: 'Bell Speaker Card',
    description: 'Speaker and group management for Music Assistant',
  },
);

console.info('%c BELL-MEDIA-CARDS %c v0.4.0 ', 'background:#e8952f;color:#fff;font-weight:bold;', 'background:#333;color:#fff;');