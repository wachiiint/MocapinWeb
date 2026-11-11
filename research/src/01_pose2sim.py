"""Step 1-3: video → augmented 3D markers (.trc), using Pose2Sim.

RTMPose 2D (HALPE_26) → sync → triangulate → Butterworth filter → LSTM augmenter.
Reads inputs from data/ and writes clean outputs (.trc + logs.txt) to target/.
"""
# [Anti-Slop: 10% - @wachi - pure slop]
import argparse
from contextlib import redirect_stderr, redirect_stdout
import logging
import os
from pathlib import Path
import shutil

import rtoml

os.environ["TQDM_DISABLE"] = "1"
os.environ["MPLBACKEND"] = "Agg"
logging.disable(logging.WARNING)
from Pose2Sim import Pose2Sim
logging.disable(logging.NOTSET)

RESEARCH_DIR = Path(__file__).resolve().parent.parent
STAGES = [
    ("calibration", Pose2Sim.calibration),
    ("poseEstimation", Pose2Sim.poseEstimation),
    ("synchronization", Pose2Sim.synchronization),
    ("personAssociation", Pose2Sim.personAssociation),
    ("triangulation", Pose2Sim.triangulation),
    ("filtering", Pose2Sim.filtering),
    ("markerAugmentation", Pose2Sim.markerAugmentation),
]
INTERMEDIATE_PATHS = ["pose", "pose-sync", "pose-associated", "videos", "calibration", "Config.toml"]


def load_config(data_dir: Path, target_dir: Path, height: float, mass: float) -> dict:
    """Read Config.toml and silence popups, plots, and intermediate bloat."""
    config = rtoml.load(data_dir / "Config.toml")
    config["project"].update(
        project_dir=str(target_dir), participant_height=height, participant_mass=mass
    )
    config["pose"].update(display_detection=False, save_video="none", overwrite_pose=True)
    config["synchronization"].update(
        display_sync_plots=False, synchronization_gui=False, save_sync_plots=False
    )
    config["triangulation"].update(show_interp_indices=False, make_c3d=False)
    config["filtering"].update(display_figures=False, save_filt_plots=False, make_c3d=False)
    config["markerAugmentation"]["make_c3d"] = False
    config.setdefault("logging", {})["use_custom_logging"] = True
    return config


def stage_workspace(data_dir: Path, target_dir: Path) -> None:
    """Reset target/ and symlink input files so data/ stays untouched."""
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True)
    for name in ("videos", "calibration", "Config.toml"):
        (target_dir / name).symlink_to(data_dir / name)


def cleanup_workspace(target_dir: Path) -> None:
    """Remove intermediate JSON folders and input symlinks from target/."""
    for name in INTERMEDIATE_PATHS:
        path = target_dir / name
        if path.is_symlink() or path.is_file():
            path.unlink()
        elif path.is_dir():
            shutil.rmtree(path)


def setup_file_logger(log_path: Path) -> None:
    """Send Pose2Sim logs exclusively to target/logs.txt instead of terminal."""
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.INFO)
    handler = logging.FileHandler(log_path, mode="w", encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(handler)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", nargs="?", type=Path, default=RESEARCH_DIR / "data", help="input folder (default: data/)")
    parser.add_argument("--target", type=Path, default=RESEARCH_DIR / "target", help="output folder (default: target/)")
    parser.add_argument("--height", type=float, required=True, help="metres")
    parser.add_argument("--mass", type=float, required=True, help="kg")
    args = parser.parse_args()

    data_dir = args.data.resolve()
    target_dir = args.target.resolve()
    stage_workspace(data_dir, target_dir)

    log_path = target_dir / "logs.txt"
    setup_file_logger(log_path)
    config = load_config(data_dir, target_dir, args.height, args.mass)

    has_calib_toml = any((data_dir / "calibration").glob("*.toml"))
    os.chdir(target_dir)

    with open(log_path, "a", encoding="utf-8") as log_stream:
        for name, stage in STAGES:
            if name == "calibration" and has_calib_toml:
                print(f"[skip] {name} (using existing calibration/*.toml)", flush=True)
                continue
            print(f"[run]  {name}...", flush=True)
            with redirect_stdout(log_stream), redirect_stderr(log_stream):
                stage(config)

    cleanup_workspace(target_dir)
    trc_files = sorted((target_dir / "pose-3d").glob("*_LSTM.trc"))
    print(f"[done] {trc_files[0] if trc_files else target_dir / 'pose-3d'}")


if __name__ == "__main__":
    main()
