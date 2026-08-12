#!/usr/bin/env python3

from pathlib import Path
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


def instantiate(source: Path, destination: Path, weight: int) -> None:
    if destination.is_file() and destination.stat().st_size > 0:
        return
    font = TTFont(source)
    axes = {
        axis.axisTag: weight if axis.axisTag == "wght" else axis.defaultValue
        for axis in font["fvar"].axes
    }
    instance = instantiateVariableFont(
        font,
        axes,
        inplace=False,
        optimize=False,
        updateFontNames=True,
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    instance.save(destination)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(
            "Usage: instantiate-editor-font.py NORMAL_VARIABLE ITALIC_VARIABLE OUTPUT_DIR"
        )

    normal_source = Path(sys.argv[1])
    italic_source = Path(sys.argv[2])
    output_directory = Path(sys.argv[3])
    instantiate(normal_source, output_directory / "regular.ttf", 400)
    instantiate(normal_source, output_directory / "bold.ttf", 700)
    instantiate(italic_source, output_directory / "italic.ttf", 400)
    instantiate(italic_source, output_directory / "bold-italic.ttf", 700)


if __name__ == "__main__":
    main()
