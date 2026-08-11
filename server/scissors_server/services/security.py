from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Sequence

from ..models import ToolInputError, ToolResult
from .common import (
    PDF_MEDIA_TYPE,
    option_color,
    option_float,
    option_int,
    option_text,
    output_path,
    require_file,
    require_pdf,
)


def protect_pdf(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pypdf import PdfReader, PdfWriter

    pdf = require_pdf(files)
    password = option_text(options, "password", required=True)
    owner_password = option_text(options, "owner_password", password)
    reader = PdfReader(str(pdf))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.encrypt(
        user_password=password,
        owner_password=owner_password,
        algorithm="AES-256",
    )
    destination = output_path(workdir, f"{pdf.stem}-protected", ".pdf")
    writer.write(str(destination))
    writer.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def unlock_pdf(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pypdf import PdfReader, PdfWriter

    pdf = require_pdf(files)
    password = option_text(options, "password", required=True)
    reader = PdfReader(str(pdf))
    if not reader.is_encrypted:
        raise ToolInputError("This PDF is not password protected.")
    if reader.decrypt(password) == 0:
        raise ToolInputError("The PDF password is incorrect.")
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    destination = output_path(workdir, f"{pdf.stem}-unlocked", ".pdf")
    writer.write(str(destination))
    writer.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def watermark(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    import pymupdf

    pdf = require_pdf(files)
    text = option_text(options, "text", "ScissorsDoc")
    document = pymupdf.open(str(pdf))
    fontsize = option_float(options, "font_size", 42, minimum=8, maximum=144)
    color = option_color(options, default="#94a3b8")
    rotation = option_int(options, "rotation", 45)
    if rotation % 90:
        rotation = 0
    for page in document:
        page.insert_textbox(
            page.rect,
            text,
            fontsize=fontsize,
            color=color,
            align=pymupdf.TEXT_ALIGN_CENTER,
            rotate=rotation,
            overlay=True,
        )
    destination = output_path(workdir, f"{pdf.stem}-watermarked", ".pdf")
    document.save(str(destination), garbage=4, deflate=True)
    document.close()
    return ToolResult.file(destination, PDF_MEDIA_TYPE)


def digitally_sign(
    files: Sequence[Path], options: Mapping[str, Any], workdir: Path
) -> ToolResult:
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import signers

    pdf = require_pdf(files)
    certificate = require_file(files, {".p12", ".pfx"})
    passphrase = option_text(options, "certificate_password").encode() or None
    signer = signers.SimpleSigner.load_pkcs12(
        pfx_file=str(certificate),
        passphrase=passphrase,
    )
    if signer is None:
        raise ToolInputError("The PKCS#12 certificate could not be loaded.")
    destination = output_path(workdir, f"{pdf.stem}-digitally-signed", ".pdf")
    metadata = signers.PdfSignatureMetadata(
        field_name=option_text(options, "field_name", "Signature1"),
        reason=option_text(options, "reason", "Digitally signed with ScissorsDoc"),
        location=option_text(options, "location"),
    )
    with pdf.open("rb") as source, destination.open("wb") as target:
        writer = IncrementalPdfFileWriter(source)
        signers.PdfSigner(metadata, signer=signer).sign_pdf(writer, output=target)
    return ToolResult.file(destination, PDF_MEDIA_TYPE)
