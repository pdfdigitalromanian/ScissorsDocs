from __future__ import annotations

import importlib
import pkgutil
from typing import Dict, Iterable

from . import tools
from .models import ToolHandler


def _discover_tools() -> Dict[str, ToolHandler]:
    handlers: Dict[str, ToolHandler] = {}
    for module_info in pkgutil.iter_modules(tools.__path__):
        if module_info.name.startswith("_"):
            continue
        module = importlib.import_module(f"{tools.__name__}.{module_info.name}")
        tool_id = getattr(module, "TOOL_ID", None)
        handler = getattr(module, "run", None)
        if not isinstance(tool_id, str) or not callable(handler):
            continue
        if tool_id in handlers:
            raise RuntimeError(f'Duplicate tool id "{tool_id}".')
        handlers[tool_id] = handler
    return handlers


TOOL_HANDLERS = _discover_tools()


def list_tool_ids() -> Iterable[str]:
    return sorted(TOOL_HANDLERS)


def get_tool(tool_id: str) -> ToolHandler:
    try:
        return TOOL_HANDLERS[tool_id]
    except KeyError as error:
        raise KeyError(f'Unknown tool "{tool_id}".') from error
