from __future__ import annotations

import json
import logging
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from . import __version__
from .models import ToolInputError, ToolResult
from .registry import get_tool, list_tool_ids

LOGGER = logging.getLogger("scissors_server")
MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024
CHUNK_SIZE_BYTES = 1024 * 1024

app = FastAPI(
    title="ScissorsDoc Tools Server",
    version=__version__,
    description="Local Python processing service for ScissorsDoc document tools.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _safe_upload_name(index: int, filename: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", Path(filename).name).strip("-.")
    return f"{index:02d}-{cleaned or 'upload.bin'}"


async def _save_upload(upload: UploadFile, destination: Path) -> None:
    size = 0
    with destination.open("wb") as target:
        while chunk := await upload.read(CHUNK_SIZE_BYTES):
            size += len(chunk)
            if size > MAX_FILE_SIZE_BYTES:
                raise ToolInputError(
                    f'"{upload.filename or "upload"}" is larger than 200 MB.'
                )
            target.write(chunk)
    await upload.close()


def _parse_options(raw_options: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(raw_options or "{}")
    except json.JSONDecodeError as error:
        raise ToolInputError("Options must be valid JSON.") from error
    if not isinstance(parsed, dict):
        raise ToolInputError("Options must be a JSON object.")
    return parsed


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "version": __version__,
        "tool_count": len(tuple(list_tool_ids())),
    }


@app.get("/api/tools")
def tools_index() -> Dict[str, Any]:
    return {"tools": list(list_tool_ids())}


@app.post("/api/tools/{tool_id}")
async def execute_tool(
    tool_id: str,
    files: List[UploadFile] = File(default=[]),
    options: str = Form(default="{}"),
):
    try:
        handler = get_tool(tool_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    temporary = tempfile.TemporaryDirectory(prefix=f"scissordoc-{tool_id}-")
    workdir = Path(temporary.name)
    upload_paths: List[Path] = []
    try:
        for index, upload in enumerate(files):
            destination = workdir / _safe_upload_name(
                index,
                upload.filename or "upload.bin",
            )
            await _save_upload(upload, destination)
            upload_paths.append(destination)
        parsed_options = _parse_options(options)
        result: ToolResult = await run_in_threadpool(
            handler,
            upload_paths,
            parsed_options,
            workdir,
        )
    except ToolInputError as error:
        temporary.cleanup()
        raise HTTPException(status_code=400, detail=str(error)) from error
    except HTTPException:
        temporary.cleanup()
        raise
    except Exception as error:
        temporary.cleanup()
        LOGGER.exception("Tool %s failed", tool_id)
        raise HTTPException(
            status_code=500,
            detail=f"{tool_id} could not process this request.",
        ) from error

    if result.output_path is not None:
        if not result.output_path.exists():
            temporary.cleanup()
            raise HTTPException(status_code=500, detail="Tool output was not created.")
        return FileResponse(
            path=result.output_path,
            media_type=result.media_type,
            filename=result.download_name,
            background=BackgroundTask(temporary.cleanup),
        )

    payload = result.payload or {}
    temporary.cleanup()
    return JSONResponse(payload)
