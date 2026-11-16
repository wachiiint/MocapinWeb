"""Scale generic OpenSim muscle model (.osim) using augmented 3D markers (.trc)."""
import argparse
import logging
import os
from pathlib import Path

os.environ["MPLBACKEND"] = "Agg"
logging.disable(logging.WARNING)
import opensim
from Pose2Sim.kinematics import get_opensim_setup_dir, perform_scaling
logging.disable(logging.NOTSET)

from _log import redirect_c_logs

RESEARCH_DIR = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=RESEARCH_DIR / "target")
    parser.add_argument("--height", type=float, required=True, help="metres")
    parser.add_argument("--mass", type=float, required=True, help="kg")
    args = parser.parse_args()

    target_dir = args.target.resolve()
    trc_file = sorted((target_dir / "pose-3d").glob("*_LSTM.trc"))[0]
    kinematics_dir = target_dir / "kinematics"
    kinematics_dir.mkdir(parents=True, exist_ok=True)

    print("[run]  scaling...", flush=True)
    opensim.Logger.setLevelString("Info")
    with redirect_c_logs(target_dir / "logs.txt"):
        perform_scaling(
            trc_file=trc_file,
            pose_model="LSTM",
            kinematics_dir=kinematics_dir,
            osim_setup_dir=get_opensim_setup_dir(),
            subject_height=args.height,
            subject_mass=args.mass,
            remove_scaling_setup=True,
        )
    osim_file = kinematics_dir / f"{trc_file.stem}.osim"
    print(f"[done] {osim_file}")


if __name__ == "__main__":
    main()
