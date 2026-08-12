#!/usr/bin/env bash

set -euo pipefail

fonts_root="public/fonts/editor"
google_fonts_raw="https://raw.githubusercontent.com/google/fonts/main/ofl"
work_root="$(mktemp -d "${TMPDIR:-/tmp}/scissorsdoc-editor-fonts.XXXXXX")"
fonttools_root="${TMPDIR:-/tmp}/scissorsdoc-fonttools"

cleanup() {
  case "$work_root" in
    */scissorsdoc-editor-fonts.*) rm -rf "$work_root" ;;
  esac
}

trap cleanup EXIT

mkdir -p "$fonts_root/lato" "$fonts_root/lora" "$fonts_root/fira-sans"

download() {
  local source="$1"
  local destination="$2"
  if [[ -s "$destination" ]]; then
    return
  fi
  local partial="$destination.partial"
  curl \
    --globoff \
    --fail \
    --location \
    --silent \
    --show-error \
    --retry 5 \
    --retry-all-errors \
    --connect-timeout 20 \
    --max-time 180 \
    "$source" \
    --output "$partial"
  mv "$partial" "$destination"
}

ensure_fonttools() {
  if [[ ! -x "$fonttools_root/bin/python" ]]; then
    python3 -m venv "$fonttools_root"
    "$fonttools_root/bin/python" -m pip install \
      --disable-pip-version-check \
      --quiet \
      'fonttools==4.59.1'
  fi
}

download_variable_family() {
  local google_directory="$1"
  local destination_directory="$2"
  local normal_filename="$3"
  local italic_filename="$4"
  local family_work="$work_root/$destination_directory"
  local family_output="$fonts_root/$destination_directory"

  mkdir -p "$family_work" "$family_output"
  download "$google_fonts_raw/$google_directory/$normal_filename" "$family_work/normal.ttf"
  download "$google_fonts_raw/$google_directory/$italic_filename" "$family_work/italic.ttf"
  download "$google_fonts_raw/$google_directory/OFL.txt" "$family_output/OFL.txt"
  "$fonttools_root/bin/python" scripts/instantiate-editor-font.py \
    "$family_work/normal.ttf" \
    "$family_work/italic.ttf" \
    "$family_output"
}

download "$google_fonts_raw/lato/Lato-Regular.ttf" "$fonts_root/lato/regular.ttf"
download "$google_fonts_raw/lato/Lato-Bold.ttf" "$fonts_root/lato/bold.ttf"
download "$google_fonts_raw/lato/Lato-Italic.ttf" "$fonts_root/lato/italic.ttf"
download "$google_fonts_raw/lato/Lato-BoldItalic.ttf" "$fonts_root/lato/bold-italic.ttf"
download "$google_fonts_raw/lato/OFL.txt" "$fonts_root/lato/OFL.txt"

lora_raw="https://raw.githubusercontent.com/cyrealtype/Lora-Cyrillic/main"
download "$lora_raw/fonts/ttf/Lora-Regular.ttf" "$fonts_root/lora/regular.ttf"
download "$lora_raw/fonts/ttf/Lora-Bold.ttf" "$fonts_root/lora/bold.ttf"
download "$lora_raw/fonts/ttf/Lora-Italic.ttf" "$fonts_root/lora/italic.ttf"
download "$lora_raw/fonts/ttf/Lora-BoldItalic.ttf" "$fonts_root/lora/bold-italic.ttf"
download "$lora_raw/OFL.txt" "$fonts_root/lora/OFL.txt"

download "$google_fonts_raw/firasans/FiraSans-Regular.ttf" "$fonts_root/fira-sans/regular.ttf"
download "$google_fonts_raw/firasans/FiraSans-Bold.ttf" "$fonts_root/fira-sans/bold.ttf"
download "$google_fonts_raw/firasans/FiraSans-Italic.ttf" "$fonts_root/fira-sans/italic.ttf"
download "$google_fonts_raw/firasans/FiraSans-BoldItalic.ttf" "$fonts_root/fira-sans/bold-italic.ttf"
download "$google_fonts_raw/firasans/OFL.txt" "$fonts_root/fira-sans/OFL.txt"

ensure_fonttools

download_variable_family roboto roboto 'Roboto[wdth,wght].ttf' 'Roboto-Italic[wdth,wght].ttf'
download_variable_family opensans open-sans 'OpenSans[wdth,wght].ttf' 'OpenSans-Italic[wdth,wght].ttf'
download_variable_family montserrat montserrat 'Montserrat[wght].ttf' 'Montserrat-Italic[wght].ttf'
download_variable_family raleway raleway 'Raleway[wght].ttf' 'Raleway-Italic[wght].ttf'
download_variable_family nunito nunito 'Nunito[wght].ttf' 'Nunito-Italic[wght].ttf'
download_variable_family playfairdisplay playfair-display 'PlayfairDisplay[wght].ttf' 'PlayfairDisplay-Italic[wght].ttf'
download_variable_family rubik rubik 'Rubik[wght].ttf' 'Rubik-Italic[wght].ttf'
download_variable_family notosans noto-sans 'NotoSans[wdth,wght].ttf' 'NotoSans-Italic[wdth,wght].ttf'
download_variable_family notoserif noto-serif 'NotoSerif[wdth,wght].ttf' 'NotoSerif-Italic[wdth,wght].ttf'
download_variable_family sourcesans3 source-sans-3 'SourceSans3[wght].ttf' 'SourceSans3-Italic[wght].ttf'
download_variable_family sourceserif4 source-serif-4 'SourceSerif4[opsz,wght].ttf' 'SourceSerif4-Italic[opsz,wght].ttf'
download_variable_family librebaskerville libre-baskerville 'LibreBaskerville[wght].ttf' 'LibreBaskerville-Italic[wght].ttf'
download_variable_family alegreya alegreya 'Alegreya[wght].ttf' 'Alegreya-Italic[wght].ttf'
download_variable_family crimsonpro crimson-pro 'CrimsonPro[wght].ttf' 'CrimsonPro-Italic[wght].ttf'
download_variable_family cabin cabin 'Cabin[wdth,wght].ttf' 'Cabin-Italic[wdth,wght].ttf'
download_variable_family karla karla 'Karla[wght].ttf' 'Karla-Italic[wght].ttf'
download_variable_family mulish mulish 'Mulish[wght].ttf' 'Mulish-Italic[wght].ttf'

mkdir -p "$fonts_root/barlow" "$fonts_root/poppins" "$fonts_root/pt-sans"
download "$google_fonts_raw/barlow/Barlow-Regular.ttf" "$fonts_root/barlow/regular.ttf"
download "$google_fonts_raw/barlow/Barlow-Bold.ttf" "$fonts_root/barlow/bold.ttf"
download "$google_fonts_raw/barlow/Barlow-Italic.ttf" "$fonts_root/barlow/italic.ttf"
download "$google_fonts_raw/barlow/Barlow-BoldItalic.ttf" "$fonts_root/barlow/bold-italic.ttf"
download "$google_fonts_raw/barlow/OFL.txt" "$fonts_root/barlow/OFL.txt"
download "$google_fonts_raw/poppins/Poppins-Regular.ttf" "$fonts_root/poppins/regular.ttf"
download "$google_fonts_raw/poppins/Poppins-Bold.ttf" "$fonts_root/poppins/bold.ttf"
download "$google_fonts_raw/poppins/Poppins-Italic.ttf" "$fonts_root/poppins/italic.ttf"
download "$google_fonts_raw/poppins/Poppins-BoldItalic.ttf" "$fonts_root/poppins/bold-italic.ttf"
download "$google_fonts_raw/poppins/OFL.txt" "$fonts_root/poppins/OFL.txt"
download "$google_fonts_raw/ptsans/PT_Sans-Web-Regular.ttf" "$fonts_root/pt-sans/regular.ttf"
download "$google_fonts_raw/ptsans/PT_Sans-Web-Bold.ttf" "$fonts_root/pt-sans/bold.ttf"
download "$google_fonts_raw/ptsans/PT_Sans-Web-Italic.ttf" "$fonts_root/pt-sans/italic.ttf"
download "$google_fonts_raw/ptsans/PT_Sans-Web-BoldItalic.ttf" "$fonts_root/pt-sans/bold-italic.ttf"
download "$google_fonts_raw/ptsans/OFL.txt" "$fonts_root/pt-sans/OFL.txt"

find "$fonts_root" -type f -name '*.ttf' -exec wc -c {} +
