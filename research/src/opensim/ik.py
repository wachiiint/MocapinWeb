"""Run OpenSim Inverse Kinematics (.mot) from scaled .osim and augmented .trc."""
import argparse
import os
from pathlib import Path
from Pose2Sim.kinematics import get_opensim_setup_dir, perform_IK

RESEARCH_DIR = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=RESEARCH_DIR / "target")
    args = parser.parse_args()

    target_dir = args.target.resolve()
    trc_file = sorted((target_dir / "pose-3d").glob("*_LSTM.trc"))[0]
    kinematics_dir = target_dir / "kinematics"
    os.chdir(kinematics_dir)

    perform_IK(
        trc_file=trc_file,
        kinematics_dir=kinematics_dir,
        osim_setup_dir=get_opensim_setup_dir(),
        pose_model="LSTM",
        remove_IK_setup=False,
    )


if __name__ == "__main__":
    main()
