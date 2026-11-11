"""Step 1-3: video → augmented 3D markers (.trc), using Pose2Sim.

RTMPose 2D (HALPE_26) → sync → triangulate → Butterworth filter → LSTM augmenter.
Stops before Pose2Sim's own kinematics: scaling + IK use Lai-Uhlrich in later steps.
"""
# [Anti-Slop: 10% - @wachi - pure slop]
import argparse
import os
from pathlib import Path

import rtoml
from Pose2Sim import Pose2Sim

STAGES = [
    Pose2Sim.calibration,
    Pose2Sim.poseEstimation,
    Pose2Sim.synchronization,
    Pose2Sim.personAssociation,
    Pose2Sim.triangulation,
    Pose2Sim.filtering,
    Pose2Sim.markerAugmentation,
]


def load_config(trial: Path, height: float, mass: float) -> dict:
    """Read the trial's Config.toml and turn off every pop-up window."""
    config = rtoml.load(trial / "Config.toml")
    config["project"].update(
        project_dir=str(trial), participant_height=height, participant_mass=mass
    )
    config["pose"]["display_detection"] = False
    config["synchronization"]["display_sync_plots"] = False
    config["synchronization"]["synchronization_gui"] = False
    config["filtering"]["display_figures"] = False
    return config


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trial", type=Path, help="trial folder with Config.toml")
    parser.add_argument("--height", type=float, required=True, help="metres")
    parser.add_argument("--mass", type=float, required=True, help="kg")
    args = parser.parse_args()

    trial = args.trial.resolve()
    config = load_config(trial, args.height, args.mass)
    os.chdir(trial)  # Pose2Sim resolves some paths from the working directory
    for stage in STAGES:
        stage(config)


if __name__ == "__main__":
    main()
