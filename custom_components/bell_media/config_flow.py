"""Config flow for Bell Media Cards integration."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.core import HomeAssistant

from .const import DOMAIN, MASS_DOMAIN

_LOGGER = logging.getLogger(__name__)


def _get_mass_entry(hass: HomeAssistant):
    """Get the loaded Music Assistant config entry."""
    for entry in hass.config_entries.async_entries(MASS_DOMAIN):
        if entry.state.value == "loaded":
            return entry
    return None


class BellMediaConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Bell Media Cards."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        mass_entry = _get_mass_entry(self.hass)

        if not mass_entry:
            return self.async_abort(reason="mass_not_found")

        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(
                title="Bell Media Cards",
                data={"mass_entry_id": mass_entry.entry_id},
            )

        return self.async_show_form(
            step_id="user",
            description_placeholders={
                "mass_name": mass_entry.title or "Music Assistant",
            },
        )