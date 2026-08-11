from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Sequence

from ..models import ToolInputError, ToolResult
from .common import (
    PDF_MEDIA_TYPE,
    option_bool,
    option_color,
    option_float,
    option_rect,
    option_text,
    output_path,
    page_index,
    require_file,
    require_pdf,
)


def _open_document(files: Sequence[Path]):
    import pymupdf

    pdf = require_pdf(files)
    document = pymupdf.open(str(pdf))
    if document.page_count == 0:
        document.close()
        raise ToolInputError("The PDF has no pages.")
    return pdf, document


def _save(document: Any, pdf: Path, workdir: Path, operation: str) -> ToolResult:
    destination = output_path(workdir, f"{pdf.stem}-{operation}", ".pdf")
    document.save(str(destination), garbage=4, deflate=True, clean=True)
    document.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def edit_text(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf, document = _open_document(files)
    page = document[page_index(options, document.page_count)]
    rect = pymupdf.Rect(option_rect(options))
    text = option_text(options, "text", required=True)
    page.add_redact_annot(rect, fill=(1, 1, 1))
    page.apply_redactions()
    page.insert_textbox(
        rect,
        text,
        fontsize=option_float(options, "font_size", 12, minimum=4, maximum=72),
        color=option_color(options),
    )
    return _save(document, pdf, workdir, "edited")


def edit_images(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf, document = _open_document(files)
    image = require_file(files, {".png", ".jpg", ".jpeg", ".webp"})
    if image == pdf:
        document.close()
        raise ToolInputError("Add an image file alongside the PDF.")
    page = document[page_index(options, document.page_count)]
    page.insert_image(
        pymupdf.Rect(option_rect(options)),
        filename=str(image),
        overlay=True,
        keep_proportion=option_bool(options, "keep_proportion", True),
    )
    return _save(document, pdf, workdir, "image-added")


def edit_shapes(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf, document = _open_document(files)
    page = document[page_index(options, document.page_count)]
    rect = pymupdf.Rect(option_rect(options))
    color = option_color(options)
    fill = option_color(options, "fill", "#ffffff") if option_bool(options, "filled") else None
    width = option_float(options, "width", 2, minimum=0.25, maximum=20)
    shape = option_text(options, "shape", "rectangle").lower()
    if shape in {"ellipse", "circle", "oval"}:
        page.draw_oval(rect, color=color, fill=fill, width=width, overlay=True)
    elif shape == "line":
        page.draw_line(rect.tl, rect.br, color=color, width=width)
    else:
        page.draw_rect(rect, color=color, fill=fill, width=width, overlay=True)
    return _save(document, pdf, workdir, "shape-added")


def edit_draw(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf, document = _open_document(files)
    page = document[page_index(options, document.page_count)]
    raw_points = options.get("points")
    if isinstance(raw_points, str):
        raw_points = [pair.strip().split(":") for pair in raw_points.split(",")]
    if not isinstance(raw_points, (list, tuple)) or len(raw_points) < 2:
        document.close()
        raise ToolInputError('Option "points" must contain at least two x:y points.')
    try:
        points = [pymupdf.Point(float(point[0]), float(point[1])) for point in raw_points]
    except (TypeError, ValueError, IndexError) as error:
        document.close()
        raise ToolInputError('Option "points" must use x:y coordinates.') from error
    color = option_color(options)
    width = option_float(options, "width", 2, minimum=0.25, maximum=20)
    for start, end in zip(points, points[1:]):
        page.draw_line(start, end, color=color, width=width, overlay=True)
    return _save(document, pdf, workdir, "drawing-added")


def edit_highlight(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf, document = _open_document(files)
    page = document[page_index(options, document.page_count)]
    search = option_text(options, "search")
    targets = page.search_for(search) if search else [pymupdf.Rect(option_rect(options))]
    if not targets:
        document.close()
        raise ToolInputError(f'Could not find "{search}" on the selected page.')
    for target in targets:
        annotation = page.add_highlight_annot(target)
        annotation.set_colors(stroke=option_color(options, default="#fbbf24"))
        annotation.update()
    return _save(document, pdf, workdir, "highlighted")


def edit_annotate(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf, document = _open_document(files)
    page = document[page_index(options, document.page_count)]
    rect = option_rect(options)
    annotation = page.add_text_annot(
        pymupdf.Point(rect[0], rect[1]),
        option_text(options, "text", required=True),
    )
    annotation.set_info(title=option_text(options, "author", "ScissorsDoc"))
    annotation.update()
    return _save(document, pdf, workdir, "annotated")


def edit_signature(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf, document = _open_document(files)
    signature = require_file(files, {".png", ".jpg", ".jpeg"})
    if signature == pdf:
        document.close()
        raise ToolInputError("Add a PNG or JPEG signature image alongside the PDF.")
    page = document[page_index(options, document.page_count)]
    page.insert_image(
        pymupdf.Rect(option_rect(options)),
        filename=str(signature),
        keep_proportion=True,
        overlay=True,
    )
    return _save(document, pdf, workdir, "signed-visible")


def edit_forms(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf, document = _open_document(files)
    page = document[page_index(options, document.page_count)]
    widget = pymupdf.Widget()
    widget.field_name = option_text(options, "name", "field")
    widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
    widget.field_value = option_text(options, "value")
    widget.field_label = option_text(options, "label", widget.field_name)
    widget.rect = pymupdf.Rect(option_rect(options))
    widget.text_fontsize = option_float(
        options, "font_size", 11, minimum=4, maximum=72
    )
    page.add_widget(widget)
    return _save(document, pdf, workdir, "form-field-added")
