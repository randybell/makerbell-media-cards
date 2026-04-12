"""Bell Media Cards integration for Home Assistant."""

from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_SERVER_URL, CONF_TOKEN, DOMAIN

_LOGGER = logging.getLogger(__name__)

type BellMediaConfigEntry = ConfigEntry


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Bell Media Cards component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: BellMediaConfigEntry) -> bool:
    """Set up Bell Media Cards from a config entry."""
    from music_assistant_client import MusicAssistantClient

    server_url = entry.data[CONF_SERVER_URL]
    token = entry.data[CONF_TOKEN]
    session = async_get_clientsession(hass)

    client = MusicAssistantClient(server_url, session, token=token)

    try:
        await client.start_listening()
    except Exception as err:
        _LOGGER.error("Failed to connect to Music Assistant: %s", err)
        return False

    hass.data[DOMAIN][entry.entry_id] = client

    _register_services(hass, entry)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: BellMediaConfigEntry) -> bool:
    """Unload a config entry."""
    client = hass.data[DOMAIN].pop(entry.entry_id, None)
    if client:
        await client.disconnect()
    return True


def _get_client(hass: HomeAssistant) -> Any:
    """Get the first available MA client."""
    for client in hass.data[DOMAIN].values():
        return client
    raise ValueError("No Music Assistant connection available")


def _register_services(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Register Bell Media services."""

    if hass.services.has_service(DOMAIN, "get_queue_items"):
        return

    async def handle_get_queue_items(call: ServiceCall) -> dict:
        """Get full queue items list."""
        client = _get_client(hass)
        queue_id = call.data["queue_id"]
        limit = call.data.get("limit", 50)
        offset = call.data.get("offset", 0)

        items = await client.send_command(
            "player_queues/items",
            queue_id=queue_id,
            limit=limit,
            offset=offset,
        )

        return {
            "items": [
                {
                    "queue_item_id": item.queue_item_id,
                    "name": item.name,
                    "duration": item.duration,
                    "media_item": {
                        "uri": item.media_item.uri if item.media_item else None,
                        "name": item.media_item.name if item.media_item else None,
                        "media_type": item.media_item.media_type.value if item.media_item else None,
                        "image": _get_image_url(item.media_item) if item.media_item else None,
                        "artists": [
                            {"name": a.name, "uri": a.uri}
                            for a in (item.media_item.artists or [])
                        ] if item.media_item and hasattr(item.media_item, "artists") else [],
                        "album": {
                            "name": item.media_item.album.name,
                            "uri": item.media_item.album.uri,
                            "image": _get_image_url(item.media_item.album),
                        } if item.media_item and hasattr(item.media_item, "album") and item.media_item.album else None,
                    },
                }
                for item in items
            ]
        }

    async def handle_get_players(call: ServiceCall) -> dict:
        """Get all available players."""
        client = _get_client(hass)
        players = await client.send_command("players/all")

        return {
            "players": [
                {
                    "player_id": p.player_id,
                    "name": p.display_name,
                    "available": p.available,
                    "state": p.state.value if p.state else "unknown",
                    "volume_level": p.volume_level,
                    "volume_muted": p.volume_muted,
                    "group_childs": p.group_childs or [],
                    "synced_to": p.synced_to,
                    "type": p.type.value if p.type else "unknown",
                }
                for p in players
            ]
        }

    async def handle_get_queue(call: ServiceCall) -> dict:
        """Get queue metadata."""
        client = _get_client(hass)
        queue_id = call.data["queue_id"]
        queue = await client.send_command(
            "player_queues/get_queue",
            queue_id=queue_id,
        )

        return {
            "queue_id": queue.queue_id,
            "active": queue.active,
            "name": queue.display_name,
            "items": queue.items,
            "shuffle_enabled": queue.shuffle_enabled,
            "repeat_mode": queue.repeat_mode.value if queue.repeat_mode else "off",
            "current_index": queue.current_index,
            "elapsed_time": queue.elapsed_time,
            "current_item": _serialize_queue_item(queue.current_item) if queue.current_item else None,
            "next_item": _serialize_queue_item(queue.next_item) if queue.next_item else None,
        }

    async def handle_get_favorites(call: ServiceCall) -> dict:
        """Get favorites from library."""
        client = _get_client(hass)
        media_type = call.data.get("media_type", "track")
        limit = call.data.get("limit", 50)
        offset = call.data.get("offset", 0)

        items = await client.send_command(
            f"music/{media_type}s/library_items",
            favorite=True,
            limit=limit,
            offset=offset,
        )

        return {
            "items": [
                {
                    "name": item.name,
                    "uri": item.uri,
                    "media_type": item.media_type.value if item.media_type else media_type,
                    "image": _get_image_url(item),
                    "artists": [
                        {"name": a.name, "uri": a.uri}
                        for a in (item.artists or [])
                    ] if hasattr(item, "artists") and item.artists else [],
                }
                for item in items
            ]
        }

    async def handle_send_command(call: ServiceCall) -> dict:
        """Send a raw command to Music Assistant."""
        client = _get_client(hass)
        command = call.data["command"]
        args = call.data.get("args", {})

        result = await client.send_command(command, **args)

        if isinstance(result, list):
            return {"result": [_safe_serialize(item) for item in result]}
        elif result is not None:
            return {"result": _safe_serialize(result)}
        return {"result": None}

    hass.services.async_register(
        DOMAIN,
        "get_queue_items",
        handle_get_queue_items,
        schema=vol.Schema({
            vol.Required("queue_id"): str,
            vol.Optional("limit", default=50): int,
            vol.Optional("offset", default=0): int,
        }),
        supports_response=SupportsResponse.ONLY,
    )

    hass.services.async_register(
        DOMAIN,
        "get_players",
        handle_get_players,
        schema=vol.Schema({}),
        supports_response=SupportsResponse.ONLY,
    )

    hass.services.async_register(
        DOMAIN,
        "get_queue",
        handle_get_queue,
        schema=vol.Schema({
            vol.Required("queue_id"): str,
        }),
        supports_response=SupportsResponse.ONLY,
    )

    hass.services.async_register(
        DOMAIN,
        "get_favorites",
        handle_get_favorites,
        schema=vol.Schema({
            vol.Optional("media_type", default="track"): str,
            vol.Optional("limit", default=50): int,
            vol.Optional("offset", default=0): int,
        }),
        supports_response=SupportsResponse.ONLY,
    )

    hass.services.async_register(
        DOMAIN,
        "send_command",
        handle_send_command,
        schema=vol.Schema({
            vol.Required("command"): str,
            vol.Optional("args", default={}): dict,
        }),
        supports_response=SupportsResponse.ONLY,
    )


def _get_image_url(item: Any) -> str | None:
    """Extract image URL from a media item."""
    if not item:
        return None
    if hasattr(item, "image") and item.image:
        if isinstance(item.image, str):
            return item.image
        if hasattr(item.image, "url"):
            return item.image.url
    if hasattr(item, "metadata") and item.metadata:
        images = getattr(item.metadata, "images", None)
        if images and len(images) > 0:
            img = images[0]
            return img.url if hasattr(img, "url") else str(img)
    return None


def _serialize_queue_item(item: Any) -> dict | None:
    """Serialize a queue item to dict."""
    if not item:
        return None
    return {
        "queue_item_id": item.queue_item_id,
        "name": item.name,
        "duration": item.duration,
        "media_item": {
            "uri": item.media_item.uri if item.media_item else None,
            "name": item.media_item.name if item.media_item else None,
            "media_type": item.media_item.media_type.value if item.media_item else None,
            "image": _get_image_url(item.media_item) if item.media_item else None,
        } if item.media_item else None,
    }


def _safe_serialize(obj: Any) -> Any:
    """Safely serialize an object to JSON-compatible dict."""
    if isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    if isinstance(obj, dict):
        return {k: _safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize(item) for item in obj]
    if hasattr(obj, "__dict__"):
        result = {}
        for key, value in obj.__dict__.items():
            if not key.startswith("_"):
                try:
                    result[key] = _safe_serialize(value)
                except Exception:
                    result[key] = str(value)
        return result
    return str(obj)
