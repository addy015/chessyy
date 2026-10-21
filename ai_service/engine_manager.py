"""
Stockfish Engine Manager

Stockfish is an external standalone chess engine (executable binary).
This file:
1. Locates the Stockfish executable across local folders, environment variables, or system PATH.
2. Spawns an engine process via the UCI (Universal Chess Interface) protocol.
3. Configures CPU thread and memory (Hash) limits to prevent server overload.
"""

import os
import shutil
from pathlib import Path
from typing import Optional
import chess.engine

# Directory path of this ai_service folder
SERVICE_DIR = Path(__file__).resolve().parent

# Optional local folder where a Stockfish executable might be placed
DEFAULT_BIN_DIR = SERVICE_DIR / "bin"


def find_stockfish_binary() -> Optional[str]:
    """
    Locates the Stockfish executable by checking 3 locations in order:
    1. STOCKFISH_PATH environment variable (useful in Docker/Render deployments).
    2. Local 'bin' directory inside ai_service (.exe on Windows or binary on Linux).
    3. Global system PATH (e.g. /usr/games/stockfish installed via package manager).

    Returns the file path string if found, or None if not found.
    """
    # 1. Check custom environment variable first
    env_path = os.getenv("STOCKFISH_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    # 2. Check local ai_service/bin/ folder
    if DEFAULT_BIN_DIR.exists():
        # Look for Windows executable (.exe)
        for exe in DEFAULT_BIN_DIR.glob("**/*.exe"):
            if "stockfish" in exe.name.lower():
                return str(exe.resolve())

        # Look for Linux executable file with execute permissions
        for binary in DEFAULT_BIN_DIR.glob("**/stockfish*"):
            if binary.is_file() and os.access(binary, os.X_OK):
                return str(binary.resolve())

    # 3. Check system PATH (e.g. installed globally on the operating system)
    which_path = shutil.which("stockfish")
    if which_path:
        return which_path

    return None


class EngineManager:
    """
    Manages starting, configuring, and querying the Stockfish engine process.
    Uses the standard Universal Chess Interface (UCI) protocol.
    """

    def __init__(self, binary_path: Optional[str] = None):
        # Locate the executable once when the manager is initialized
        self.binary_path = binary_path or find_stockfish_binary()
        self._engine: Optional[chess.engine.SimpleEngine] = None

    def is_available(self) -> bool:
        """Checks if the Stockfish binary was found and is ready to run."""
        return bool(self.binary_path and os.path.exists(self.binary_path))

    def get_engine_name(self) -> str:
        """Returns the official name and version string reported by Stockfish."""
        if not self.is_available():
            return "Engine binary not found"
        try:
            with chess.engine.SimpleEngine.popen_uci(self.binary_path) as eng:
                return eng.id.get("name", "Stockfish")
        except Exception as e:
            return f"Error: {e}"

    def spawn_engine(self, threads: int = 2, hash_mb: int = 64) -> chess.engine.SimpleEngine:
        """
        Starts a new Stockfish engine process to analyze a chess game.

        Resource limits:
        - threads: Number of CPU cores to use (default: 2, keeps CPU usage balanced).
        - hash_mb: Memory (RAM) cache in megabytes for calculation trees.
          64 MB is used to stay safely within free-tier cloud limits (e.g., Render 512 MB).
        """
        if not self.is_available():
            raise FileNotFoundError(f"Stockfish binary not found. Searched {self.binary_path}")

        # Start the engine process via UCI
        engine = chess.engine.SimpleEngine.popen_uci(self.binary_path)
        try:
            # Apply CPU threads and memory limits
            engine.configure({"Threads": threads, "Hash": hash_mb})
        except Exception:
            # If the engine version does not support a specific flag, proceed with defaults
            pass
        return engine


# Shared singleton instance used across the AI service
engine_manager = EngineManager()
