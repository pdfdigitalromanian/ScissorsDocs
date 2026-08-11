from __future__ import annotations

import io
from pathlib import Path
from typing import Any, Mapping, Sequence

from ..models import ToolInputError, ToolResult
from .common import (
    PDF_MEDIA_TYPE,
    option_int,
    output_path,
    require_pdf,
)


def compress_pdf(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf = require_pdf(files)
    document = pymupdf.open(str(pdf))
    destination = output_path(workdir, f"{pdf.stem}-compressed", ".pdf")
    document.save(
        str(destination),
        garbage=4,
        deflate=True,
        deflate_images=True,
        deflate_fonts=True,
        clean=True,
        linear=True,
    )
    document.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def ocr_scans(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf
    import pytesseract
    from PIL import Image
    from pypdf import PdfReader, PdfWriter

    pdf = require_pdf(files)
    source = pymupdf.open(str(pdf))
    dpi = option_int(options, "dpi", 200, minimum=100, maximum=400)
    language = str(options.get("language", "eng"))
    writer = PdfWriter()
    try:
        for page in source:
            pixmap = page.get_pixmap(dpi=dpi, alpha=False)
            image = Image.open(io.BytesIO(pixmap.tobytes("png")))
            page_pdf = pytesseract.image_to_pdf_or_hocr(
                image,
                extension="pdf",
                lang=language,
            )
            writer.add_page(PdfReader(io.BytesIO(page_pdf)).pages[0])
            image.close()
    except pytesseract.TesseractNotFoundError as error:
        writer.close()
        source.close()
        raise ToolInputError(
            "OCR requires the Tesseract system binary. Install tesseract and retry."
        ) from error
    source.close()
    destination = output_path(workdir, f"{pdf.stem}-ocr", ".pdf")
    writer.write(str(destination))
    writer.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def optimize_images(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf = require_pdf(files)
    source = pymupdf.open(str(pdf))
    output = pymupdf.open()
    dpi = option_int(options, "dpi", 130, minimum=72, maximum=300)
    quality = option_int(options, "quality", 72, minimum=20, maximum=95)
    for page in source:
        pixmap = page.get_pixmap(dpi=dpi, alpha=False)
        image_bytes = pixmap.tobytes("jpeg", jpg_quality=quality)
        target = output.new_page(width=page.rect.width, height=page.rect.height)
        target.insert_image(target.rect, stream=image_bytes)
    source.close()
    destination = output_path(workdir, f"{pdf.stem}-images-optimized", ".pdf")
    output.save(str(destination), garbage=4, deflate=True)
    output.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)
