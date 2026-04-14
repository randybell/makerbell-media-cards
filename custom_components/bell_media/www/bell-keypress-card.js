// bell-speaker-card.js v0.5.0
// MakerBell Media Cards - Speaker & Group Management

class BellSpeakerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._api = null;
    this._hass = null;
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
    const dropdown = this.shadowRoot?.querySelector('.bell-dropdown');
    if (dropdown && dropdown.value !== e.detail.player) {
      dropdown.value = e.detail.player;
    }
    this._renderPlayers();
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
      this._loadPlayers();
    } else {
      this._updatePlayerRows();
    }
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
      console.error('Bell Speaker: Failed to load players:', e);
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
    if (!this._hass || !this._hass.states) return;
    const players = this._getFilteredPlayers();
    players.forEach(player => {
      const id = player.player_id;
      const entityId = this._findMediaPlayerEntity(id);
      if (!entityId) return;

      const state = this._hass.states[entityId];
      if (!state) return;

      const vol = Math.round((state.attributes.volume_level || 0) * 100);
      const muted = state.attributes.is_volume_muted || false;

      const slider = this.shadowRoot?.querySelector(`input[data-player="${id}"]`);
      const pct = this.shadowRoot?.querySelector(`.pct-${CSS.escape(id)}`);
      const muteBtn = this.shadowRoot?.querySelector(`.mute-${CSS.escape(id)}`);

      if (slider && parseInt(slider.value) !== vol) {
        slider.value = vol;
      }
      if (pct) pct.textContent = `${vol}%`;
      if (muteBtn) {
        muteBtn.innerHTML = muted ? window.BellMedia.ICONS.mute : window.BellMedia.ICONS.unmute;
        muteBtn.classList.toggle('muted', muted);
      }
    });
  }

  _findMediaPlayerEntity(playerId) {
    if (!this._hass || !this._hass.states) return null;
    for (const entityId of Object.keys(this._hass.states)) {
      if (!entityId.startsWith('media_player.')) continue;
      const state = this._hass.states[entityId];
      if (state.attributes.mass_player_id === playerId) return entityId;
    }
    return null;
  }

  async _onActivePlayerChange(e) {
    window.BellMedia.setActivePlayer(e.target.value);
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
    const activeName = window.BellMedia.getActivePlayer();
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
      console.error('Bell Speaker: Join/unjoin failed:', e);
    }
  }

  _renderPlayers() {
    const container = this.shadowRoot?.querySelector('.players-list');
    const dropdown = this.shadowRoot?.querySelector('.bell-dropdown');
    if (!container || !dropdown) return;

    const players = this._getFilteredPlayers();
    const activeName = window.BellMedia.getActivePlayer();

    dropdown.innerHTML = players.map(p => {
      const name = p.display_name || p.name || p.player_id;
      return `<option value="${name}" ${name === activeName ? 'selected' : ''}>${name}</option>`;
    }).join('');

    if (!activeName && players.length > 0) {
      const firstName = players[0].display_name || players[0].name;
      window.BellMedia.setActivePlayer(firstName);
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
            ${window.BellMedia.ICONS.unmute}
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
              ${isSynced ? window.BellMedia.ICONS.link : window.BellMedia.ICONS.unlink}
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
    const BM = window.BellMedia;
    this.shadowRoot.innerHTML = `
      <style>${BM.STYLES}</style>
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

customElements.define('bell-speaker-card', BellSpeakerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'bell-speaker-card',
  name: 'Bell Speaker Card',
  description: 'Speaker and group management for Music Assistant',
});

console.info('%c BELL-SPEAKER-CARD %c v0.5.0 ', 'background:#e8952f;color:#fff;font-weight:bold;', 'background:#333;color:#fff;');