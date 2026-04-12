# bell_media/__init__.py v0.3.0

from __future__ import annotations

import logging
import os
from typing import Any

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse

from .const import DOMAIN, MASS_DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SELECT]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Bell Media Cards component."""
    hass.data.setdefault(DOMAIN, {})
    return True


def _get_mass_client(hass: HomeAssistant, entry: ConfigEntry):
    """Get the MusicAssistantClient from the core MA integration."""
    mass_entry_id = entry.data.get("mass_entry_id")

    for ma_entry in hass.config_entries.async_entries(MASS_DOMAIN):
        if mass_entry_id and ma_entry.entry_id != mass_entry_id:
            continue
        if ma_entry.state.value != "loaded":
            continue

        runtime_data = ma_entry.runtime_data
        if runtime_data is None:
            continue

        if hasattr(runtime_data, "mass"):
            return runtime_data.mass
        if hasattr(runtime_data, "client"):
            return runtime_data.client
        if hasattr(runtime_data, "send_command"):
            return runtime_data

        _LOGGER.debug(
            "MA runtime_data type: %s, attrs: %s",
            type(runtime_data).__name__,
            [a for a in dir(runtime_data) if not a.startswith("_")],
        )
        return runtime_data

    return None


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Bell Media Cards from a config entry."""
    mass = _get_mass_client(hass, entry)

    if mass is None:
        _LOGGER.error("Music Assistant client not available")
        return False

    hass.data[DOMAIN][entry.entry_id] = {
        "client": mass,
    }

    _LOGGER.info(
        "Bell Media Cards connected to Music Assistant (client type: %s)",
        type(mass).__name__,
    )

    _register_services(hass)
    _register_frontend(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok


def _register_frontend(hass: HomeAssistant) -> None:
    """Register the frontend JS card."""
    js_path = os.path.join(
        os.path.dirname(__file__), "www", "bell-media-cards.js"
    )
    if os.path.exists(js_path):
        url = f"/{DOMAIN}/bell-media-cards.js"
        hass.http.register_static_path(url, js_path, cache_headers=False)
        add_extra_js_url(hass, url)
        _LOGGER.debug("Registered frontend: %s", url)
    else:
        _LOGGER.warning("Frontend JS not found at %s", js_path)


def _get_client(hass: HomeAssistant) -> Any:
    """Get the first available MA client."""
    for data in hass.data[DOMAIN].values():
        if isinstance(data, dict) and "client" in data:
            return data["client"]
    raise ValueError("No Music Assistant connection available")


def _register_services(hass: HomeAssistant) -> None:
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

        return {"items": _safe_serialize(items)}

    async def handle_get_players(call: ServiceCall) -> dict:
        """Get all available players."""
        client = _get_client(hass)
        players = await client.send_command("players/all")
        return {"players": _safe_serialize(players)}

    async def handle_get_queue(call: ServiceCall) -> dict:
        """Get queue metadata."""
        client = _get_client(hass)
        queue_id = call.data["queue_id"]
        queue = await client.send_command(
            "player_queues/get_queue",
            queue_id=queue_id,
        )
        return {"queue": _safe_serialize(queue)}

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

        return {"items": _safe_serialize(items)}

    async def handle_send_command(call: ServiceCall) -> dict:
        """Send a raw command to Music Assistant."""
        client = _get_client(hass)
        command = call.data["command"]
        args = call.data.get("args", {})
        result = await client.send_command(command, **args)
        return {"result": _safe_serialize(result)}

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


def _safe_serialize(obj: Any) -> Any:
    """Safely serialize an object to JSON-compatible format."""
    if isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    if isinstance(obj, dict):
        return {k: _safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize(item) for item in obj]
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
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