// bell-search-card.js v0.5.0
// MakerBell Media Cards - Search Results Display

class BellSearchCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._api = null;
    this._rendered = false;
    this._results = null;
    this._activeTab = 'all';
    this._loading = false;
    this._lastQuery = '';
    this._debounceTimer = null;
    this._boundOnBufferChange = this._onBufferChange.bind(this);
    this._boundOnHelperChange = null;
  }

  connectedCallback() {
    window.addEventListener('bell-buffer-changed', this._boundOnBufferChange);
  }

  disconnectedCallback() {
    window.removeEventListener('bell-buffer-changed', this._boundOnBufferChange);
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
  }

  _onBufferChange(e) {
    if (this._config.keyboard_mode !== 'standard') {
      const key = this._config.buffer_key || window.BellMedia.DEFAULT_BUFFER_KEY;
      if (e.detail.key === key) {
        this._handleQueryChange(e.detail.value);
      }
    }
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

    // Standard mode: watch input_text helper
    if (this._config.keyboard_mode === 'standard' && this._config.input_entity && hass.states) {
      const state = hass.states[this._config.input_entity];
      if (state && state.state !== this._lastQuery) {
        this._handleQueryChange(state.state);
      }
    }
  }

  setConfig(config) {
    this._config = {
      entity_id: config.entity_id || '',
      keyboard_mode: config.keyboard_mode || 'bell-keypress-card',
      buffer_key: config.buffer_key || window.BellMedia.DEFAULT_BUFFER_KEY,
      input_entity: config.input_entity || '',
      config_entry_id: config.config_entry_id || '',
      search_limit: config.search_limit || 20,
      art_size: config.art_size || 40,
      card_height: config.card_height || null,
      card_width: config.card_width || null,
      ...config,
    };
  }

  getCardSize() {
    return 6;
  }

  static getStubConfig() {
    return {
      entity_id: 'media_player.master_speaker_group',
      config_entry_id: '01KNVFF1J228ZV7PQV88F3YETZ',
    };
  }

  _handleQueryChange(query) {
    if (query === this._lastQuery) return;
    this._lastQuery = query;

    if (this._debounceTimer) clearTimeout(this._debounceTimer);

    if (!query || query.trim().length < 2) {
      if (!query || query.length === 0) {
        this._results = null;
        this._renderContent();
      }
      return;
    }

    this._debounceTimer = setTimeout(() => this._search(query.trim()), 300);
  }

  async _search(query) {
    if (!query || !this._hass) return;
    this._loading = true;
    this._renderContent();

    try {
      const result = await this._api.search(
        query,
        this._config.search_limit,
        this._config.config_entry_id,
      );

      if (result && result.response) {
        this._results = result.response;
      } else if (result && result.service_response) {
        this._results = result.service_response;
      } else {
        this._results = result || null;
      }
    } catch (e) {
      console.error('Bell Search: Search failed:', e);
      this._results = null;
    }

    this._loading = false;
    this._renderContent();
  }

  async _playMedia(item, enqueue) {
    if (!this._hass) return;
    const entityId = this._config.entity_id || null;
    if (!entityId) return;

    try {
      const data = {
        media_id: item.uri,
        media_type: item.media_type,
        entity_id: entityId,
      };
      if (enqueue) data.enqueue = enqueue;
      await this._api.callService('music_assistant', 'play_media', data);
    } catch (e) {
      console.error('Bell Search: Play failed:', e);
    }
  }

  _setTab(tab) {
    this._activeTab = tab;
    this._renderContent();
  }

  _getItems() {
    if (!this._results) return [];
    if (this._activeTab === 'all') {
      const all = [];
      if (this._results.tracks) all.push(...this._results.tracks);
      if (this._results.artists) all.push(...this._results.artists);
      if (this._results.albums) all.push(...this._results.albums);
      if (this._results.playlists) all.push(...this._results.playlists);
      return all;
    }
    return this._results[this._activeTab] || [];
  }

  _getTabCount(tab) {
    if (!this._results) return 0;
    if (tab === 'all') {
      return (this._results.tracks || []).length +
        (this._results.artists || []).length +
        (this._results.albums || []).length +
        (this._results.playlists || []).length;
    }
    return (this._results[tab] || []).length;
  }

  _renderContent() {
    const BM = window.BellMedia;
    const tabContainer = this.shadowRoot?.querySelector('.tabs');
    const container = this.shadowRoot?.querySelector('.results-list');
    if (!tabContainer || !container) return;

    const tabs = ['all', 'tracks', 'albums', 'artists', 'playlists'];
    tabContainer.innerHTML = tabs.map(t => {
      const count = this._getTabCount(t);
      const label = t.charAt(0).toUpperCase() + t.slice(1);
      const countStr = this._results && count > 0 ? ` (${count})` : '';
      return `<span class="tab ${this._activeTab === t ? 'active' : ''}" data-tab="${t}">${label}${countStr}</span>`;
    }).join('');

    tabContainer.querySelectorAll('.tab').forEach(el => {
      el.addEventListener('click', () => this._setTab(el.dataset.tab));
    });

    if (this._loading) {
      container.innerHTML = '<div class="bell-status">Searching...</div>';
      return;
    }

    if (!this._results) {
      container.innerHTML = '<div class="bell-status">Enter a search term</div>';
      return;
    }

    const items = this._getItems();
    if (items.length === 0) {
      container.innerHTML = '<div class="bell-status">No results</div>';
      return;
    }

    const artSize = this._config.art_size || 40;

    container.innerHTML = items.map((item, i) => {
      const img = BM.getImageUrl(item);
      const imgHtml = img
        ? `<img src="${img}" alt="" loading="lazy" style="width:${artSize}px;height:${artSize}px;" />`
        : BM.artPlaceholder(artSize);
      const artists = BM.getArtists(item);
      const typeBadge = this._activeTab === 'all'
        ? `<span class="type-badge">${item.media_type || ''}</span>`
        : '';

      return `
        <div class="bell-result-row" data-index="${i}">
          <div class="bell-art" style="width:${artSize}px;height:${artSize}px;">${imgHtml}</div>
          <div class="bell-result-info">
            <div class="bell-result-name">${item.name || 'Unknown'}</div>
            <div class="bell-result-artist">${artists} ${typeBadge}</div>
          </div>
          <div class="bell-result-actions">
            <button class="bell-action-btn" data-index="${i}" data-action="play" title="Play now">${BM.ICONS.play}</button>
            <button class="bell-action-btn" data-index="${i}" data-action="next" title="Play next">${BM.ICONS.next}</button>
            <button class="bell-action-btn" data-index="${i}" data-action="add" title="Add to queue">${BM.ICONS.queue_add}</button>
            <button class="bell-action-btn" data-index="${i}" data-action="replace" title="Replace queue">${BM.ICONS.radio}</button>
          </div>
        </div>`;
    }).join('');

    const allItems = items;
    container.querySelectorAll('.bell-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const action = btn.dataset.action;
        const enqueue = action === 'play' ? null : action === 'next' ? 'next' : action === 'add' ? 'add' : 'replace';
        this._playMedia(allItems[idx], enqueue);
      });
    });

    container.querySelectorAll('.bell-result-row').forEach(row => {
      row.addEventListener('click', () => {
        this._playMedia(allItems[parseInt(row.dataset.index)], null);
      });
    });
  }

  _render() {
    const BM = window.BellMedia;
    const widthStyle = this._config.card_width ? `max-width:${this._config.card_width}px;` : '';
    const heightStyle = this._config.card_height ? `max-height:${this._config.card_height}px;overflow-y:auto;` : '';

    this.shadowRoot.innerHTML = `
      <style>
        ${BM.STYLES}
        .tabs { display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap; }
        .tab {
          color: var(--secondary-text-color, rgba(255,255,255,0.5));
          font-size: 13px;
          padding: 6px 12px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          user-select: none;
          transition: color 0.15s;
        }
        .tab.active {
          color: var(--accent-color, #e8952f);
          border-bottom-color: var(--accent-color, #e8952f);
        }
        .type-badge {
          display: inline-block;
          font-size: 10px;
          text-transform: uppercase;
          color: var(--accent-color, #e8952f);
          background: rgba(232, 149, 47, 0.15);
          padding: 1px 5px;
          border-radius: 3px;
          margin-left: 4px;
        }
      </style>
      <ha-card>
        <div class="bell-card" style="${widthStyle}">
          <div class="tabs"></div>
          <div class="results-list" style="${heightStyle}"></div>
        </div>
      </ha-card>
    `;

    this._renderContent();
  }
}

customElements.define('bell-search-card', BellSearchCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'bell-search-card',
  name: 'Bell Search Card',
  description: 'Search results display for Music Assistant',
});

console.info('%c BELL-SEARCH-CARD %c v0.5.0 ', 'background:#e8952f;color:#fff;font-weight:bold;', 'background:#333;color:#fff;');
