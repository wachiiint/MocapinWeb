"""Shared C++/Python log redirection helper for OpenSim scripts."""
from contextlib import contextmanager
import os
from pathlib import Path


@contextmanager
def redirect_c_logs(log_path: Path):
    """Append C++ and Python stdout/stderr to log_path during OpenSim calls."""
    fd_out, fd_err = os.dup(1), os.dup(2)
    with open(log_path, "a", encoding="utf-8") as f:
        os.dup2(f.fileno(), 1)
        os.dup2(f.fileno(), 2)
        try:
            yield
        finally:
            os.dup2(fd_out, 1)
            os.dup2(fd_err, 2)
            os.close(fd_out)
            os.close(fd_err)
