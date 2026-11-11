# Research pipeline

Offline Python version of the Data pipeline in [docs/architect.md](../docs/architect.md). Never imported by the backend.

| Folder | Holds | In git |
|---|---|---|
| `steps/` | One script per step: `trial folder → output subfolder` | ✅ |
| `models/` | `.osim` models + setup XMLs | ✅ (weights ❌) |
| `data/` | Trials: videos, calibration, outputs | ❌ |

## Environments

| Env | Steps | Tool |
|---|---|---|
| `pose` | 1–5 | Pose2Sim + OpenSim |
| `sim` | 7 | opencap-processing |
| `wham` | 1-camera path | WHAM |

### `pose` env

Pose2Sim needs Python 3.11 or later. OpenSim installs from pip with it.

```bash
uv venv ~/.venv/pose --python 3.12        # new env, kept outside the repo
source ~/.venv/pose/bin/activate
uv pip install pose2sim                   # pulls opensim, rtmlib (RTMPose), onnxruntime
```

Optional GPU: `uv pip install onnxruntime-gpu` (needs CUDA).

### Demo trial

```bash
mkdir -p research/data/trials
cp -r "$(python -c 'import Pose2Sim, os; print(os.path.dirname(Pose2Sim.__file__))')/Demo_SinglePerson" research/data/trials/demo
```

## Run

```bash
python research/steps/01_pose2sim.py research/data/trials/demo --height 1.72 --mass 70
```

| Step | Output in trial folder |
|---|---|
| `01_pose2sim.py` | `pose-3d/*_LSTM.trc`: augmented markers |
