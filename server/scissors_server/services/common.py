from __future__ import annotations

import re
import zipfile
from pathlib import Path
from typing import Any, Iterable, List, Mapping, Optional, Sequence, Tuple

from ..models import ToolInputError

PDF_MEDIA_TYPE = "application/pdf"
ZIP_MEDIA_TYPE = "application/zip"
DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


def require_files(files: Sequence[Path], minimum: int = 1) -> Sequence[Path]:
    if len(files) < minimum:
        noun = "file" if minimum == 1 else f"{minimum} files"
        raise ToolInputError(f"This tool requires at least {noun}.")
    return files


def require_file(files: Sequence[Path], suffixes: Iterable[str] = ()) -> Path:
    require_files(files)
    allowed = {suffix.lower() for suffix in suffixes}
    if not allowed:
        return files[0]
    for path in files:
        if path.suffix.lower() in allowed:
            return path
    readable = ", ".join(sorted(allowed))
    raise ToolInputError(f"Expected a file with one of these extensions: {readable}.")


def require_pdf(files: Sequence[Path]) -> Path:
    return require_file(files, {".pdf"})


def output_path(workdir: Path, stem: str, suffix: str) -> Path:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("-.") or "result"
    return workdir / f"{cleaned}{suffix}"


def option_text(
    options: Mapping[str, Any],
    key: str,
    default: str = "",
    required: bool = False,
) -> str:
    value = str(options.get(key, default)).strip()
    if required and not value:
        raise ToolInputError(f'Option "{key}" is required.')
    return value


def option_int(
    options: Mapping[str, Any],
    key: str,
    default: int,
    minimum: Optional[int] = None,
    maximum: Optional[int] = None,
) -> int:
    try:
        value = int(options.get(key, default))
    except (TypeError, ValueError) as error:
        raise ToolInputError(f'Option "{key}" must be an integer.') from error
    if minimum is not None and value < minimum:
        raise ToolInputError(f'Option "{key}" must be at least {minimum}.')
    if maximum is not None and value > maximum:
        raise ToolInputError(f'Option "{key}" must be at most {maximum}.')
    return value


def option_float(
    options: Mapping[str, Any],
    key: str,
    default: float,
    minimum: Optional[float] = None,
    maximum: Optional[float] = None,
) -> float:
    try:
        value = float(options.get(key, default))
    except (TypeError, ValueError) as error:
        raise ToolInputError(f'Option "{key}" must be a number.') from error
    if minimum is not None and value < minimum:
        raise ToolInputError(f'Option "{key}" must be at least {minimum}.')
    if maximum is not None and value > maximum:
        raise ToolInputError(f'Option "{key}" must be at most {maximum}.')
    return value


def option_bool(options: Mapping[str, Any], key: str, default: bool = False) -> bool:
    value = options.get(key, default)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def option_rect(
    options: Mapping[str, Any],
    default: Tuple[float, float, float, float] = (72, 72, 360, 144),
) -> Tuple[float, float, float, float]:
    value = options.get("rect", default)
    if isinstance(value, str):
        value = [part.strip() for part in value.split(",")]
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ToolInputError('Option "rect" must contain x0,y0,x1,y1.')
    try:
        rect = tuple(float(part) for part in value)
    except (TypeError, ValueError) as error:
        raise ToolInputError('Option "rect" must contain four numbers.') from error
    if rect[2] <= rect[0] or rect[3] <= rect[1]:
        raise ToolInputError('Option "rect" must have positive width and height.')
    return rect  # type: ignore[return-value]


def option_color(
    options: Mapping[str, Any],
    key: str = "color",
    default: str = "#2563ff",
) -> Tuple[float, float, float]:
    value = str(options.get(key, default)).strip().lstrip("#")
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", value):
        raise ToolInputError(f'Option "{key}" must be a hex color.')
    return tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4))  # type: ignore[return-value]


def page_index(options: Mapping[str, Any], page_count: int) -> int:
    page = option_int(options, "page", 1, minimum=1)
    if page > page_count:
        raise ToolInputError(f"Page {page} is outside this {page_count}-page document.")
    return page - 1


def parse_page_spec(spec: Any, page_count: int) -> List[int]:
    if spec in (None, "", []):
        return list(range(page_count))
    if isinstance(spec, (list, tuple)):
        tokens = [str(value) for value in spec]
    else:
        tokens = [token.strip() for token in str(spec).split(",")]
    pages: List[int] = []
    for token in tokens:
        if not token:
            continue
        if "-" in token:
            start_text, end_text = token.split("-", 1)
            try:
                start, end = int(start_text), int(end_text)
            except ValueError as error:
                raise ToolInputError("Page ranges must look like 1-3,5.") from error
            step = 1 if end >= start else -1
            values = range(start, end + step, step)
        else:
            try:
                values = [int(token)]
            except ValueError as error:
                raise ToolInputError("Pages must look like 1-3,5.") from error
        for value in values:
            if value < 1 or value > page_count:
                raise ToolInputError(
                    f"Page {value} is outside this {page_count}-page document."
                )
            pages.append(value - 1)
    if not pages:
        raise ToolInputError("Select at least one page.")
    return pages


def create_zip(paths: Sequence[Path], destination: Path) -> Path:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in paths:
            archive.write(path, arcname=path.name)
    return destination
