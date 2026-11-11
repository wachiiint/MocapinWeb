# Research pipeline
[Anti-Slop: 60% - @wachi - frustration, will append later]
Offline Python version of the Data pipeline in [docs/architect.md](../docs/architect.md). Never imported by the backend.

Directory
```txt
.
├── src             # pipeline scripts (01_pose2sim.py, ...)
├── scripts         # setup_demo.sh
├── data            # input: videos/, calibration/, Config.toml (git-ignored)
├── target          # output: pose-3d/*.trc, logs.txt (git-ignored)
├── models          # .osim, setup XMLs
└── viewer          # trc.html (3D marker viewer)
```

Input format (`data/`)
- `videos/*.mp4` (at least 2 camera views, e.g. `cam01.mp4`, `cam02.mp4`)
- `calibration/*.toml` (camera intrinsics & extrinsics matching camera count)
- `Config.toml` (Pose2Sim config)

Environments
```txt
research/.venv/     # git-ignored
├── pose            # step 1–5: Pose2Sim + OpenSim
├── sim             # step 7: opencap-processing
└── wham            # 1-camera path: WHAM
```

Installation (`research/.venv/pose`)
```bash
cd research
uv venv .venv/pose --python 3.12          # new env
source .venv/pose/bin/activate
uv pip install pose2sim                   # pulls opensim, rtmlib (RTMPose), onnxruntime
uv pip install onnxruntime-gpu            # [OPTIONAL] for GPU (need CUDA)
```

Demo data
```bash
bash scripts/setup_demo.sh                # 2 cameras (default)
bash scripts/setup_demo.sh 4              # 4 cameras
```

[Anti-Slop: 20% - @wachi - didnt try]
Run
```bash
python src/01_pose2sim.py --height 1.72 --mass 70
# output: target/pose-3d/*_LSTM.trc, target/logs.txt
```

Visualization
```bash
xdg-open viewer/trc.html                  # pick target/pose-3d/*_LSTM.trc, drag = rotate, ▶ = play
                                          # orange = keypoint, blue = augmented, grid = floor (Y = 0), 0.5 m
```

How Pose2Sim calibrates, syncs, triangulates: [pose2sim-triangulation.md](pose2sim-triangulation.md)
