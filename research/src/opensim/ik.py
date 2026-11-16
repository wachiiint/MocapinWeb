"""Run OpenSim Inverse Kinematics (.mot) from scaled .osim and augmented .trc."""
import argparse
import logging
import os
from pathlib import Path

os.environ["MPLBACKEND"] = "Agg"
logging.disable(logging.WARNING)
import opensim
from Pose2Sim.kinematics import get_opensim_setup_dir, perform_IK
logging.disable(logging.NOTSET)

from _log import redirect_c_logs

RESEARCH_DIR = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=RESEARCH_DIR / "target")
    args = parser.parse_args()

    target_dir = args.target.resolve()
    trc_file = sorted((target_dir / "pose-3d").glob("*_LSTM.trc"))[0]
    kinematics_dir = target_dir / "kinematics"
    os.chdir(kinematics_dir)

    print("[run]  inverse kinematics...", flush=True)
    opensim.Logger.setLevelString("Info")
    with redirect_c_logs(target_dir / "logs.txt"):
        perform_IK(
            trc_file=trc_file,
            kinematics_dir=kinematics_dir,
            osim_setup_dir=get_opensim_setup_dir(),
            pose_model="LSTM",
            remove_IK_setup=True,
        )
    for tmp in ("_ik_marker_errors.sto", "opensim.log"):
        (kinematics_dir / tmp).unlink(missing_ok=True)
    mot_file = kinematics_dir / f"{trc_file.stem}.mot"
    print(f"[done] {mot_file}")


if __name__ == "__main__":
    main()
