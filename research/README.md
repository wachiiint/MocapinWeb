# Research pipeline
[Anti-Slop: 60% - @wachi - frustration, will append later]
Offline Python version of the Data pipeline in [docs/architect.md](../docs/architect.md). Never imported by the backend.

## Workspace

### Directory
```txt
.
├── src
│   ├── pose/pose2sim.py        # 1. video + calib -> augmented .trc
│   └── opensim/
│       ├── scale.py            # 2. .trc + height/mass -> scaled .osim
│       └── ik.py               # 3. .osim + .trc -> joint angles .mot
├── scripts                     # setup_demo.sh, clean.sh
├── data                        # input: videos/, calibration/, optional Config.toml
├── target                      # output: pose-3d/*.trc, kinematics/*.osim|*.mot, logs.txt
├── models                      # .osim, setup XMLs
└── viewer                      # trc.html, mot.html
```

### Environments
```txt
research/.venv/     # git-ignored
├── pose            # step 1–3: Pose2Sim + OpenSim
├── sim             # [planned] GRF + muscle forces
└── wham            # [planned] 1-camera path: WHAM
```

## Usage

### Installation
```bash
cd research
uv venv .venv/pose --python 3.12          # new env
source .venv/pose/bin/activate
uv pip install pose2sim                   # pulls opensim, rtmlib, onnxruntime
uv pip install onnxruntime-gpu            # [OPTIONAL] for GPU with CUDA
```

### Demo data
```bash
bash scripts/setup_demo.sh                # 2 cameras (default)
bash scripts/setup_demo.sh 4              # 4 cameras
```
- Copies `Demo_SinglePerson` videos and `Config.toml` from `Pose2Sim` into `data/`
- Converts `Calib.qca.txt` into `Calib_qualisys.toml`
- Keeps only the first 2 cameras by default, or all 4 if passed `4`

### Run
[Anti-Slop: 20% - @wachi - didnt try]
```bash
# 1. Video -> 3D markers
python src/pose/pose2sim.py --height 1.72             # -> target/pose-3d/*_LSTM.trc
xdg-open viewer/trc.html                              # [OPTIONAL] pick *_LSTM.trc (orange = keypoint, blue = augmented)

# 2. Scale model + Inverse Kinematics
python src/opensim/scale.py --height 1.72 --mass 70   # -> target/kinematics/*.osim
python src/opensim/ik.py                              # -> target/kinematics/*.mot
xdg-open viewer/mot.html                              # [OPTIONAL] pick *.mot (joint angles + ROM)

# 3. Clean generated files
bash scripts/clean.sh                                 # remove target/ (pass --all to also remove data/)
```

> (Optional) To visualize 3D skeleton and muscles (`.osim` + `.mot`): use [OpenSim GUI](https://github.com/opensim-org/opensim-gui).

## Workflow

### Inputs (`data/`)
- `videos/*.mp4`: at least 2 camera views, e.g. `cam01.mp4`, `cam02.mp4`
- `calibration/*.toml`: camera intrinsics and extrinsics matching camera count
- `Config.toml`: optional Pose2Sim overrides; defaults to Pose2Sim's built-in config if omitted

### Pipeline

| Step | Script | Input | Output |
|---|---|---|---|
| 1. Pose + Triangulation | `src/pose/pose2sim.py` | `videos/*.mp4`, `calibration/*.toml`, `--height` | `target/pose-3d/*_LSTM.trc` |
| 2. Model Scaling | `src/opensim/scale.py` | `*_LSTM.trc`, `--height`, `--mass` | `target/kinematics/*.osim` |
| 3. Inverse Kinematics | `src/opensim/ik.py` | `*_LSTM.trc`, `*.osim` | `target/kinematics/*.mot` |

### Outputs (`target/`)
- `pose-3d/*_LSTM.trc`: 65 3D markers in metres, 22 detected keypoints + 43 LSTM-augmented anatomical markers
- `kinematics/*.osim`: subject-scaled OpenSim musculoskeletal model with 318 muscles and bone lengths fitted to `.trc`
- `kinematics/*.mot`: joint angle time-series in degrees across frames, ready for OpenSim GUI or downstream dynamics
- `logs.txt`: full Pose2Sim log with per-keypoint reprojection error and camera sync offset


How Pose2Sim calibrates, syncs, triangulates: [pose2sim-triangulation.md](pose2sim-triangulation.md)
