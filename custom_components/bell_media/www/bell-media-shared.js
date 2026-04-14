// bell-media-shared.js v0.5.0
// MakerBell Media Cards - Shared Library


window.BellMedia = window.BellMedia || {};

// ============================================
// localStorage buffer
// ============================================

window.BellMedia.DEFAULT_BUFFER_KEY = 'bell_music_search_buffer';

window.BellMedia.getBuffer = function(key) {
  return localStorage.getItem(key || window.BellMedia.DEFAULT_BUFFER_KEY) || '';
};

window.BellMedia.setBuffer = function(value, key) {
  localStorage.setItem(key || window.BellMedia.DEFAULT_BUFFER_KEY, value);
  window.dispatchEvent(new CustomEvent('bell-buffer-changed', {
    detail: { key: key || window.BellMedia.DEFAULT_BUFFER_KEY, value: value },
  }));
};

window.BellMedia.clearBuffer = function(key) {
  window.BellMedia.setBuffer('', key);
};


// ============================================
// Active player - per browser tab
// ============================================

window.BellMedia.ACTIVE_PLAYER_KEY = 'bell_media_active_player';

window.BellMedia.getActivePlayer = function() {
  return sessionStorage.getItem(window.BellMedia.ACTIVE_PLAYER_KEY) || null;
};

window.BellMedia.setActivePlayer = function(playerName) {
  sessionStorage.setItem(window.BellMedia.ACTIVE_PLAYER_KEY, playerName);
  window.dispatchEvent(new CustomEvent('bell-active-player-changed', {
    detail: { player: playerName },
  }));
};


// ============================================
// API helper
// ============================================

window.BellMedia.API = class {
  constructor(hass) {
    this._hass = hass;
  }

  set hass(hass) {
    this._hass = hass;
  }

  async callService(domain, service, data) {
    if (!this._hass) return null;
    return this._hass.callService(domain, service, data);
  }

  async callBellService(service, data) {
    if (!this._hass) return null;
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

  async getFavorites(mediaType, limit, offset) {
    const result = await this.callBellService('get_favorites', {
      media_type: mediaType || 'track',
      limit: limit || 50,
      offset: offset || 0,
    });
    return result?.response?.items || [];
  }

  async sendCommand(command, args) {
    const result = await this.callBellService('send_command', {
      command: command,
      args: args || {},
    });
    return result?.response?.result || null;
  }

  async search(name, limit, configEntryId) {
    if (!this._hass) return null;
    const data = { name: name, limit: limit || 20 };
    if (configEntryId) data.config_entry_id = configEntryId;
    return this._hass.connection.sendMessagePromise({
      type: 'call_service',
      domain: 'music_assistant',
      service: 'search',
      service_data: data,
      return_response: true,
    });
  }
};


// ============================================
// SVG Icons
// ============================================

window.BellMedia.ICONS = {
  speaker: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>',
  mute: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
  unmute: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
  unlink: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.3 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16zM2 4.27l3.11 3.11A4.991 4.991 0 0 0 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4L20 19.74 3.27 3 2 4.27z"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>',
  queue_add: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v4h-2v2h2v4h2v-4h4v-2h-4V6h-2z"/></svg>',
  queue_play: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 10h11v2H3zM3 6h11v2H3zM3 14h7v2H3zM16 13v8l6-4z"/></svg>',
  radio: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3.24 6.15C2.51 6.43 2 7.17 2 8v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2H8.3l8.26-3.34-.37-.92L3.24 6.15zM7 20c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-8h-2v-2h-2v2H4V8h16v4z"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
};


// ============================================
// Shared styles
// ============================================

window.BellMedia.STYLES = `
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
  .bell-action-btn {
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.7);
    border: none;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
    font-family: inherit;
    padding: 0;
    flex-shrink: 0;
  }
  .bell-action-btn:hover {
    background: rgba(255,255,255,0.15);
    color: #fff;
  }
  .bell-action-btn:active {
    background: rgba(255,255,255,0.2);
  }
  .bell-result-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .bell-result-row:hover {
    background: rgba(255,255,255,0.05);
  }
  .bell-result-row:active {
    background: rgba(255,255,255,0.1);
  }
  .bell-result-row.current {
    background: rgba(232, 149, 47, 0.1);
    border-left: 3px solid var(--accent-color, #e8952f);
  }
  .bell-art {
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(255,255,255,0.03);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .bell-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .bell-result-info {
    flex: 1;
    min-width: 0;
  }
  .bell-result-name {
    color: var(--primary-text-color);
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bell-result-artist {
    color: var(--secondary-text-color);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bell-result-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .bell-status {
    color: var(--secondary-text-color);
    font-size: 14px;
    text-align: center;
    padding: 32px 0;
  }
`;


// ============================================
// Utility
// ============================================

window.BellMedia.getImageUrl = function(item) {
  if (!item) return null;
  if (item.image && typeof item.image === 'string') return item.image;
  if (item.image && item.image.path) return item.image.path;
  if (item.image && item.image.url) return item.image.url;
  if (item.metadata && item.metadata.images && item.metadata.images.length > 0) {
    const img = item.metadata.images[0];
    return img.path || img.url || (typeof img === 'string' ? img : null);
  }
  return null;
};

window.BellMedia.getArtists = function(item) {
  if (!item) return '';
  if (item.artists && item.artists.length > 0) {
    return item.artists.map(a => a.name).join(', ');
  }
  return '';
};

window.BellMedia.artPlaceholder = function(size) {
  return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.06));">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>
  </div>`;
};


console.info('%c BELL-MEDIA-SHARED %c v0.5.0 ', 'background:#e8952f;color:#fff;font-weight:bold;', 'background:#333;color:#fff;');
