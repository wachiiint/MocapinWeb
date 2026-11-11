#!/usr/bin/env bash
set -euo pipefail

CAMS="${1:-2}"
RESEARCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$RESEARCH_DIR/data"

PY="$(command -v python || command -v python3)"
DEMO_SRC="$("$PY" -c 'import Pose2Sim, os; print(os.path.dirname(Pose2Sim.__file__))')/Demo_SinglePerson"

rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR/videos" "$DATA_DIR/calibration"
cp "$DEMO_SRC/Config.toml" "$DATA_DIR/Config.toml"
cp "$DEMO_SRC/calibration/Calib.qca.txt" "$DATA_DIR/calibration/"

"$PY" - "$DATA_DIR" "$CAMS" <<'PY'
import logging, os, sys
from pathlib import Path
os.environ["MPLBACKEND"] = "Agg"
logging.disable(logging.WARNING)
from Pose2Sim.calibration import calib_qca_fun, toml_write

data_dir, n_cams = Path(sys.argv[1]), int(sys.argv[2])
qca = data_dir / "calibration" / "Calib.qca.txt"
toml_out = data_dir / "calibration" / "Calib_qualisys.toml"
ret, C, S, D, K, R, T = calib_qca_fun(qca, binning_factor=1)
toml_write(toml_out, C[:n_cams], S[:n_cams], D[:n_cams], K[:n_cams], R[:n_cams], T[:n_cams])
qca.unlink()
PY

for i in $(seq -f "%02g" 1 "$CAMS"); do
    cp "$DEMO_SRC/videos/cam${i}.mp4" "$DATA_DIR/videos/"
done

echo "Ready in data/ ($CAMS cameras)"
