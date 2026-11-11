# Pose2Sim: calibration, sync, triangulation
[Anti-Slop: 0% - @wachi - Not review yet]
Read from Pose2Sim 0.10.49 source (`research/.venv/pose/lib/python3.12/site-packages/Pose2Sim/`). \
Upstream: https://github.com/perfanalytics/pose2sim/tree/main/Pose2Sim

Order
```txt
calibration → poseEstimation → synchronization → personAssociation → triangulation → filtering
   (K,R,T)      2D per cam       time offset        same person         3D point
```

Calibration: required\
Triangulation needs each camera's projection matrix `P = K·[R|T]`.
```txt
K       # intrinsics: focal length, optical centre (+ distortion). Once per camera lifetime
R, T    # extrinsics: camera pose in world. Every time the rig moves
```
```txt
calibration_type = 'convert'     # import from another system (demo: Qualisys lab mocap → Calib.qca.txt)
calibration_type = 'calculate'   # our rig
├── intrinsics                   # checkerboard video per camera
└── extrinsics_method
    ├── 'board'                  # checkerboard on floor, "not recommended"
    ├── 'scene'                  # click points with known 3D coords (m), most accurate if spread out
    └── 'keypoints'              # person walks + waves arms; less accurate, needs synced cameras
```
Output: `calibration/Calib_*.toml`, one `[camXX]` section per camera (`matrix`, `distortions`, `rotation`, `translation`).\
Code: `calibration.py` → `calibrate_cams_all`, `calibrate_intrinsics`, `calibrate_extrinsics`; `common.py` → `computeP`.

Synchronization: post-hoc, no shared clock\
Cameras don't need to be started together. For each camera:
```txt
1. mean vertical speed of keypoints over time      # 1D signal per camera
2. butterworth filter (filter_cutoff = 6 Hz)
3. time-lagged cross-correlation vs reference cam   # lag with max correlation = offset in frames
4. shift json files → pose-sync/
```
Needs a clear vertical motion (e.g. raise a hand, sit-to-stand) or 5–10 s of motion.\
`keypoints_to_consider`, `approx_time_maxspeed` narrow the search.\
Result is whole frames: at 30 fps the offset can still be off by up to 1 frame (33 ms).\
Code: `synchronization.py` → `synchronize_cams_all`, `vert_speed`, `time_lagged_cross_corr`.

Person association\
Picks the same person in every camera: tries person combinations, triangulates one keypoint, keeps the lowest reprojection error (`reproj_error_threshold_association`, 20 px).\
Code: `personAssociation.py` → `best_persons_and_cameras_combination`.

Triangulation: weighted DLT\
For each frame, each keypoint:
```txt
1. each camera c gives 2 rows:  (P_c[0] − x_c·P_c[2])·w_c,  (P_c[1] − y_c·P_c[2])·w_c    # w = RTMPose confidence
2. stack → A (2·ncams × 4), solve A·Q = 0 by SVD → Q = last column of V, divide by Q[3]
3. reproject Q to every camera → error in px
4. error > threshold (15 px) → drop 1 camera, try every subset, keep best
   repeat until error ok or cameras left < min_cameras_for_triangulation (2)
5. small gaps (< 20 frames) interpolated → .trc (Y-up)
```
Camera with confidence < 0.3 is skipped for that keypoint.\
With 2 cameras there is nothing to drop: a bad keypoint is rejected, not fixed.\
Code: `triangulation.py` → `triangulate_all`, `triangulation_from_best_cameras`; `common.py` → `weighted_triangulation`, `reprojection`.

Camera matching\
Cameras are matched by order only: n-th `[camXX]` in the calibration .toml ↔ n-th `pose/camXX_json` folder (sorted by number).\
No config option to select a subset of cameras.
