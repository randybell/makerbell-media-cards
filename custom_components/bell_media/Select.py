# bell_media/select.py v0.3.0

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Bell Media active player select."""
    data = hass.data[DOMAIN].get(entry.entry_id)
    if not data:
        return

    client = data["client"]

    select = BellMediaActivePlayerSelect(hass, entry, client)
    async_add_entities([select])

    data["active_player_select"] = select


class BellMediaActivePlayerSelect(SelectEntity):
    """Select entity for choosing the active MA player."""

    _attr_has_entity_name = True
    _attr_name = "Active Player"
    _attr_icon = "mdi:speaker-group"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: Any) -> None:
        """Initialize the select entity."""
        self._hass = hass
        self._entry = entry
        self._client = client
        self._attr_unique_id = f"{DOMAIN}_active_player"
        self._attr_options = []
        self._attr_current_option = None
        self._player_map = {}

    @property
    def device_info(self):
        """Return device info."""
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "Bell Media Cards",
            "manufacturer": "MakerBell",
            "model": "Media Cards",
        }

    async def async_added_to_hass(self) -> None:
        """Run when entity is added to HA."""
        await self._update_players()

    async def _update_players(self) -> None:
        """Fetch players from MA and update options."""
        try:
            players = await self._client.send_command("players/all")

            self._player_map = {}
            options = []

            for player in players:
                name = getattr(player, "display_name", None) or getattr(player, "name", str(player))
                player_id = getattr(player, "player_id", None) or str(player)
                available = getattr(player, "available", True)

                if available:
                    self._player_map[name] = player_id
                    options.append(name)

            self._attr_options = sorted(options)

            if self._attr_current_option not in self._attr_options:
                if self._attr_options:
                    self._attr_current_option = self._attr_options[0]
                else:
                    self._attr_current_option = None

            self.async_write_ha_state()

        except Exception as err:
            _LOGGER.error("Failed to fetch MA players: %s", err)

    async def async_select_option(self, option: str) -> None:
        """Handle the user selecting a player."""
        self._attr_current_option = option
        self.async_write_ha_state()

    async def async_update(self) -> None:
        """Update the player list."""
        await self._update_players()

    def get_active_player_id(self) -> str | None:
        """Get the player_id for the currently selected player."""
        if self._attr_current_option:
            return self._player_map.get(self._attr_current_option)
        return None