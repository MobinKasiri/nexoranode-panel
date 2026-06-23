"""Register a lightweight app.config stub before importing bot XUI code."""
from __future__ import annotations

import sys
import types

from panel.bot_bridge.xui_config import XUIConfig


def bootstrap_bot_xui_imports() -> None:
    """
    Bot's app.config imports aiogram via required_channels at module load time.
    Panel only needs XUIConfig for xui_api — stub app.config before first import.
    """
    existing = sys.modules.get("app.config")
    if existing is not None:
        if hasattr(existing, "load_config"):
            return
        if not hasattr(existing, "XUIConfig"):
            existing.XUIConfig = XUIConfig
        return

    cfg = types.ModuleType("app.config")
    cfg.XUIConfig = XUIConfig
    sys.modules["app.config"] = cfg
