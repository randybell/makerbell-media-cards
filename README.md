# Bell Media Cards

A custom Home Assistant integration and Lovelace card suite for Music Assistant. Provides a jukebox-style interface with full control over layout and playback.

## Features

- **Bell Keyboard Card** — TV-style on-screen keyboard for music search
- **Bell Player Card** — Album artwork display with playback controls
- **Bell Search Card** — Search results with queue management actions
- **Bell Queue Card** — Full queue display with reorder and remove
- **Bell Speaker Card** — Speaker/group management with volume control

## Installation

### HACS (recommended)

1. Add this repository to HACS as a custom repository
2. Install "Bell Media Cards"
3. Restart Home Assistant

### Manual

1. Copy `custom_components/bell_media` to your HA `config/custom_components/` directory
2. Restart Home Assistant

## Setup

1. Go to Settings → Devices & Services → Add Integration
2. Search for "Bell Media Cards"
3. Enter your Music Assistant server URL and API token
4. The integration will connect and register services

### Getting your MA API token

1. Open the Music Assistant web UI (sidebar)
2. Go to your profile settings
3. Create a new long-lived token

## Services

| Service | Description |
|---------|-------------|
| `bell_media.get_queue_items` | Get full queue item list |
| `bell_media.get_queue` | Get queue metadata |
| `bell_media.get_players` | Get all available players |
| `bell_media.get_favorites` | Get favorites from library |
| `bell_media.send_command` | Send raw MA API command |

## License

MIT
