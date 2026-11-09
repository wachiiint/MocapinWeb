#!/usr/bin/env bash
# Linux version of prepare-models.ps1: download, verify, and install the default ONNX models.
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
model_assets="$script_dir/public"
download_dir="$(mktemp -d -t mocapin-models-XXXXXX)"
trap 'rm -rf "$download_dir"' EXIT
mkdir -p "$model_assets"

# file | url | archive entry suffix | sha256
specs=(
  "rtmdet-nano.onnx|https://download.openmmlab.com/mmpose/v1/projects/rtmpose/rtmpose-cpu.zip|rtmpose-ort/rtmdet-nano/end2end.onnx|b8585adb6d1352796f6e86337e09c3459b830645a7e7192d9381670bea2facbd"
  "rtmpose-s-halpe26.onnx|https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-s_simcc-body7_pt-body7-halpe26_700e-256x192-7f134165_20230605.zip|rtmpose-s_simcc-body7_pt-body7-halpe26_700e-256x192-7f134165_20230605/end2end.onnx|85c5d669aa0b0c7969799ea9e0620d3b8c1d3c2b6878243e98a1ef8351457986"
)

model_hash() { sha256sum "$1" | cut -d' ' -f1; }

for spec in "${specs[@]}"; do
  IFS='|' read -r file url suffix hash <<< "$spec"
  target="$model_assets/$file"
  if [[ -f "$target" && "$(model_hash "$target")" == "$hash" ]]; then
    echo "$file is ready."
    continue
  fi

  archive="$download_dir/$file.zip"
  staged="$download_dir/$file"
  curl -fL --retry 3 -o "$archive" "$url"

  mapfile -t entries < <(unzip -Z1 "$archive" | awk -v s="$suffix" 'substr($0, length($0) - length(s) + 1) == s')
  if [[ ${#entries[@]} -ne 1 ]]; then
    echo "Unexpected archive layout for $file." >&2
    exit 1
  fi
  unzip -p "$archive" "${entries[0]}" > "$staged"

  if [[ "$(model_hash "$staged")" != "$hash" ]]; then
    echo "Checksum mismatch for $file. Existing asset was not replaced." >&2
    exit 1
  fi
  cp -f "$staged" "$target"
  rm -f "$staged" "$archive"
  echo "$file is ready."
done
