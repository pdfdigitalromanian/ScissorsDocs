from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Mapping, Optional, Sequence


class ToolInputError(ValueError):
    """Raised when a tool request is valid HTTP but invalid for the tool."""


@dataclass(frozen=True)
class ToolResult:
    output_path: Optional[Path] = None
    payload: Optional[Dict[str, Any]] = None
    media_type: str = "application/octet-stream"
    download_name: Optional[str] = None

    @classmethod
    def file(
        cls,
        path: Path,
        media_type: str,
        download_name: Optional[str] = None,
    ) -> "ToolResult":
        return cls(
            output_path=path,
            media_type=media_type,
            download_name=download_name or path.name,
        )

    @classmethod
    def json(cls, payload: Dict[str, Any]) -> "ToolResult":
        return cls(payload=payload, media_type="application/json")


ToolHandler = Callable[
    [Sequence[Path], Mapping[str, Any], Path],
    ToolResult,
]
