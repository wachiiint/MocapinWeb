# Research pipeline
[Anti-Slop: 60% - @wachi - frustration, will append later]
Offline Python version of the Data pipeline in [docs/architect.md](../docs/architect.md). Never imported by the backend.

Directory
```txt
.
├── steps           # python script
├── models          # model(.osim), weight, config XML, 
└── data            # videos, output, calibrations
```

Environments
```txt
research/.venv/   # git-ignored
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

Demo trial
```bash
mkdir -p data/trials
cp -r "$(python -c 'import Pose2Sim, os; print(os.path.dirname(Pose2Sim.__file__))')/Demo_SinglePerson" data/trials/demo
```

Run
```bash
python steps/01_pose2sim.py data/trials/demo --height 1.72 --mass 70
# output: data/trials/demo/pose-3d/*_LSTM.trc   (augmented markers)
```

[Anti-Slop: 20% - @wachi - didnt try]
Visualization
```txt
data/trials/demo/
├── pose/cam0X_pose.mp4             # 2D: video + RTMPose skeleton, open in any player
├── pose-3d/filtering_plots_ik/     # 3D: x/y/z per keypoint, before vs after filter
└── logs.txt                        # numbers: reprojection error, excluded cameras per keypoint
```
```bash
xdg-open viewer/trc.html            # 3D .trc: pick pose-3d/*_LSTM.trc, drag = rotate, ▶ = play
                                    # orange = keypoint, blue = augmented, grid = floor (Y = 0), 0.5 m
```

How Pose2Sim calibrates, syncs, triangulates: [notes/pose2sim-triangulation.md](notes/pose2sim-triangulation.md)
