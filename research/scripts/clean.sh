#!/usr/bin/env bash
set -euo pipefail

RESEARCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$RESEARCH_DIR/target"

if [[ "${1:-}" == "--all" ]]; then
    rm -rf "$RESEARCH_DIR/data"
    echo "Cleaned target/ and data/"
else
    echo "Cleaned target/ (pass --all to also remove data/)"
fi
