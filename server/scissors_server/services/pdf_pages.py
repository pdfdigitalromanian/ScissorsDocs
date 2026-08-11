from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Sequence

from ..models import ToolInputError, ToolResult
from .common import (
    PDF_MEDIA_TYPE,
    ZIP_MEDIA_TYPE,
    create_zip,
    option_int,
    output_path,
    parse_page_spec,
    require_files,
    require_pdf,
)


def merge_pdfs(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pypdf import PdfWriter

    pdfs = [path for path in require_files(files, 2) if path.suffix.lower() == ".pdf"]
    if len(pdfs) < 2:
        raise ToolInputError("Merge PDFs requires at least two PDF files.")
    destination = output_path(workdir, "merged", ".pdf")
    writer = PdfWriter()
    for path in pdfs:
        writer.append(str(path))
    writer.write(str(destination))
    writer.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def split_pdf(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pypdf import PdfReader, PdfWriter

    pdf = require_pdf(files)
    reader = PdfReader(str(pdf))
    outputs = []
    for index, page in enumerate(reader.pages, start=1):
        destination = output_path(workdir, f"{pdf.stem}-page-{index}", ".pdf")
        writer = PdfWriter()
        writer.add_page(page)
        writer.write(str(destination))
        writer.close()
        outputs.append(destination)
    archive = create_zip(outputs, output_path(workdir, f"{pdf.stem}-split", ".zip"))
    return ToolResult.file(archive, ZIP_MEDIA_TYPE)


def rotate_pages(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pypdf import PdfReader, PdfWriter

    pdf = require_pdf(files)
    reader = PdfReader(str(pdf))
    angle = option_int(options, "angle", 90)
    if angle % 90:
        raise ToolInputError("Rotation angle must be a multiple of 90 degrees.")
    selected = set(parse_page_spec(options.get("pages"), len(reader.pages)))
    writer = PdfWriter()
    for index, page in enumerate(reader.pages):
        writer.add_page(page.rotate(angle) if index in selected else page)
    destination = output_path(workdir, f"{pdf.stem}-rotated", ".pdf")
    writer.write(str(destination))
    writer.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def extract_pages(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pypdf import PdfReader, PdfWriter

    pdf = require_pdf(files)
    reader = PdfReader(str(pdf))
    selected = parse_page_spec(options.get("pages"), len(reader.pages))
    writer = PdfWriter()
    for index in selected:
        writer.add_page(reader.pages[index])
    destination = output_path(workdir, f"{pdf.stem}-extracted", ".pdf")
    writer.write(str(destination))
    writer.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def delete_pages(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pypdf import PdfReader, PdfWriter

    pdf = require_pdf(files)
    reader = PdfReader(str(pdf))
    removed = set(parse_page_spec(options.get("pages"), len(reader.pages)))
    if len(removed) == len(reader.pages):
        raise ToolInputError("At least one page must remain in the PDF.")
    writer = PdfWriter()
    for index, page in enumerate(reader.pages):
        if index not in removed:
            writer.add_page(page)
    destination = output_path(workdir, f"{pdf.stem}-pages-removed", ".pdf")
    writer.write(str(destination))
    writer.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def rearrange_pages(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pypdf import PdfReader, PdfWriter

    pdf = require_pdf(files)
    reader = PdfReader(str(pdf))
    order = parse_page_spec(options.get("order"), len(reader.pages))
    if len(order) != len(reader.pages) or len(set(order)) != len(reader.pages):
        raise ToolInputError("Order must include every page exactly once.")
    writer = PdfWriter()
    for index in order:
        writer.add_page(reader.pages[index])
    destination = output_path(workdir, f"{pdf.stem}-rearranged", ".pdf")
    writer.write(str(destination))
    writer.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)
