// bell-queue-card.js v0.5.0
// MakerBell Media Cards - Queue Display

class BellQueueCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._api = null;
    this._rendered = false;
    this._queueItems = [];
    this._queueMeta = null;
    this._loading = false;
    this._lastState = '';
    this._boundOnActiveChange = this._onActivePlayerChange.bind(this);
  }

  connectedCallback() {
    window.addEventListener('bell-active-player-changed', this._boundOnActiveChange);
  }

  disconnectedCallback() {
    window.removeEventListener('bell-active-player-changed', this._boundOnActiveChange);
  }

  _onActivePlayerChange() {
    this._loadQueue();
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
      this._loadQueue();
      return;
    }

    // Auto-refresh on player state change
    if (hass && hass.states && this._config.entity_id) {
      const entity = hass.states[this._config.entity_id];
      if (entity) {
        const stateStr = entity.state + (entity.attributes.media_title || '');
        if (stateStr !== this._lastState) {
          this._lastState = stateStr;
          this._loadQueue();
        }
      }
    }
  }

  setConfig(config) {
    this._config = {
      entity_id: config.entity_id || '',
      queue_id: config.queue_id || '',
      art_size: config.art_size || 40,
      card_height: config.card_height || null,
      card_width: config.card_width || null,
      limit: config.limit || 50,
      ...config,
    };
  }

  getCardSize() {
    return 6;
  }

  static getStubConfig() {
    return { entity_id: 'media_player.master_speaker_group' };
  }

  _getQueueId() {
    return this._config.queue_id || this._config.entity_id || '';
  }

  async _loadQueue() {
    const queueId = this._getQueueId();
    if (!queueId || !this._api) return;

    this._loading = true;
    this._renderContent();

    try {
      const items = await this._api.getQueueItems(queueId, this._config.limit, 0);
      this._queueItems = items || [];

      const meta = await this._api.getQueue(queueId);
      this._queueMeta = meta;
    } catch (e) {
      console.error('Bell Queue: Failed to load queue:', e);
      this._queueItems = [];
      this._queueMeta = null;
    }

    this._loading = false;
    this._renderContent();
  }

  _getImageUrl(item) {
    const BM = window.BellMedia;
    if (item.image) return BM.getImageUrl(item);
    if (item.media_item) return BM.getImageUrl(item.media_item);
    return null;
  }

  _getTitle(item) {
    if (item.media_item && item.media_item.name) return item.media_item.name;
    if (item.name) {
      const parts = item.name.split(' - ');
      return parts.length > 1 ? parts.slice(1).join(' - ') : item.name;
    }
    return 'Unknown';
  }

  _getArtist(item) {
    const mi = item.media_item || item;
    return window.BellMedia.getArtists(mi) || '';
  }

  _getDuration(item) {
    const d = item.duration || (item.media_item && item.media_item.duration) || 0;
    if (!d) return '';
    const m = Math.floor(d / 60);
    const s = Math.floor(d % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  _isCurrentItem(item) {
    if (!this._queueMeta || !this._queueMeta.current_item) return false;
    return item.queue_item_id === this._queueMeta.current_item.queue_item_id;
  }

  async _playMedia(item, enqueue) {
    if (!this._hass) return;
    const mi = item.media_item || item;
    const entityId = this._config.entity_id;
    if (!entityId || !mi.uri) return;

    try {
      const data = {
        media_id: mi.uri,
        media_type: mi.media_type || 'track',
        entity_id: entityId,
      };
      if (enqueue) data.enqueue = enqueue;
      await this._api.callService('music_assistant', 'play_media', data);
      setTimeout(() => this._loadQueue(), 1000);
    } catch (e) {
      console.error('Bell Queue: Play failed:', e);
    }
  }

  _renderContent() {
    const BM = window.BellMedia;
    const container = this.shadowRoot?.querySelector('.queue-list');
    const header = this.shadowRoot?.querySelector('.queue-header');
    if (!container || !header) return;

    // Header
    const meta = this._queueMeta;
    const itemCount = this._queueItems.length;
    const shuffle = meta?.shuffle_enabled ? 'Shuffle' : '';
    const repeat = meta?.repeat_mode && meta.repeat_mode !== 'off' ? `Repeat: ${meta.repeat_mode}` : '';
    const statusParts = [shuffle, repeat].filter(Boolean).join(' · ');

    header.innerHTML = `
      <span class="bell-name">Queue (${itemCount})</span>
      <span style="flex:1;font-size:12px;color:var(--secondary-text-color);">${statusParts}</span>
      <button class="bell-icon-btn refresh-btn" title="Refresh">↻</button>
    `;
    header.querySelector('.refresh-btn')?.addEventListener('click', () => this._loadQueue());

    // Items
    if (this._loading && this._queueItems.length === 0) {
      container.innerHTML = '<div class="bell-status">Loading queue...</div>';
      return;
    }

    if (this._queueItems.length === 0) {
      container.innerHTML = '<div class="bell-status">Queue is empty</div>';
      return;
    }

    const artSize = this._config.art_size || 40;

    container.innerHTML = this._queueItems.map((item, i) => {
      const img = this._getImageUrl(item);
      const imgHtml = img
        ? `<img src="${img}" alt="" loading="lazy" style="width:${artSize}px;height:${artSize}px;" />`
        : BM.artPlaceholder(artSize);
      const isCurrent = this._isCurrentItem(item);
      const duration = this._getDuration(item);

      return `
        <div class="bell-result-row ${isCurrent ? 'current' : ''}" data-index="${i}">
          <div class="bell-art" style="width:${artSize}px;height:${artSize}px;">${imgHtml}</div>
          <div class="bell-result-info">
            <div class="bell-result-name">${this._getTitle(item)}</div>
            <div class="bell-result-artist">${this._getArtist(item)}${duration ? ' · ' + duration : ''}</div>
          </div>
          <div class="bell-result-actions">
            <button class="bell-action-btn" data-index="${i}" data-action="play" title="Play now">${BM.ICONS.play}</button>
            <button class="bell-action-btn" data-index="${i}" data-action="next" title="Play next">${BM.ICONS.next}</button>
            <button class="bell-action-btn" data-index="${i}" data-action="radio" title="Start radio">${BM.ICONS.radio}</button>
          </div>
        </div>`;
    }).join('');

    const allItems = this._queueItems;
    container.querySelectorAll('.bell-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const action = btn.dataset.action;
        if (action === 'radio') {
          this._playMedia(allItems[idx], 'replace');
        } else {
          const enqueue = action === 'play' ? null : action === 'next' ? 'next' : 'add';
          this._playMedia(allItems[idx], enqueue);
        }
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
      <style>${BM.STYLES}</style>
      <ha-card>
        <div class="bell-card" style="${widthStyle}">
          <div class="bell-row queue-header"></div>
          <div class="queue-list" style="${heightStyle}"></div>
        </div>
      </ha-card>
    `;

    this._renderContent();
  }
}

customElements.define('bell-queue-card', BellQueueCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'bell-queue-card',
  name: 'Bell Queue Card',
  description: 'Queue display for Music Assistant',
});

console.info('%c BELL-QUEUE-CARD %c v0.5.0 ', 'background:#e8952f;color:#fff;font-weight:bold;', 'background:#333;color:#fff;');
