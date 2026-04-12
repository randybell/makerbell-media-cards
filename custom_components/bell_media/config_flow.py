"""Config flow for Bell Media Cards integration."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .const import CONF_SERVER_URL, CONF_TOKEN, DEFAULT_SERVER_URL, DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_SERVER_URL, default=DEFAULT_SERVER_URL): str,
        vol.Required(CONF_TOKEN): str,
    }
)


async def validate_input(hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Validate the user input allows us to connect."""
    from music_assistant_client import MusicAssistantClient

    server_url = data[CONF_SERVER_URL]
    token = data[CONF_TOKEN]

    try:
        async with MusicAssistantClient(server_url, None, token=token) as client:
            server_info = client.server_info
            server_id = server_info.server_id if server_info else "unknown"
    except Exception as err:
        _LOGGER.error("Failed to connect to Music Assistant: %s", err)
        raise CannotConnect from err

    return {"title": f"Music Assistant ({server_id})"}


class BellMediaConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Bell Media Cards."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                info = await validate_input(self.hass, user_input)
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except Exception:
                _LOGGER.exception("Unexpected exception")
                errors["base"] = "unknown"
            else:
                return self.async_create_entry(title=info["title"], data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )


class CannotConnect(HomeAssistantError):
    """Error to indicate we cannot connect."""
