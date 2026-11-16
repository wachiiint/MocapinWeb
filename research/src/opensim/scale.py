"""Scale generic OpenSim muscle model (.osim) using augmented 3D markers (.trc)."""
import argparse
from pathlib import Path
from Pose2Sim.kinematics import get_opensim_setup_dir, perform_scaling

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

    perform_scaling(
        trc_file=trc_file,
        pose_model="LSTM",
        kinematics_dir=kinematics_dir,
        osim_setup_dir=get_opensim_setup_dir(),
        subject_height=args.height,
        subject_mass=args.mass,
        remove_scaling_setup=False,
    )


if __name__ == "__main__":
    main()
