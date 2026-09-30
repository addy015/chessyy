# What this file does:
# Stockfish is an external chess program (an executable file, like .exe on Windows
# or a binary on Linux). It is not a Python library.
# 
# This file:
# 1. Finds where the Stockfish program is located on the computer or server.
# 2. Starts (spawns) Stockfish when an analysis request comes in.
# 3. Limits how much CPU and RAM Stockfish can use (so it doesn't crash the server).
# -------------------------------------------------------------------------

import os
import shutil
from pathlib import Path
from typing import Optional
import chess.engine

# Directory path of this ai_service folder
SERVICE_DIR = Path(__file__).resolve().parent

# Optional folder where a local copy of Stockfish might be placed
DEFAULT_BIN_DIR = SERVICE_DIR / "bin"


def find_stockfish_binary() -> Optional[str]:
    """
    Finds the Stockfish program file by checking 3 places in order:
    1. STOCKFISH_PATH environment setting (e.g. set in Docker / Render).
    2. Local 'bin' folder inside ai_service (looks for .exe on Windows or binary on Linux).
    3. System PATH (checks if Stockfish was installed globally via apt or brew).
    
    Returns the file path string if found, or None if missing.
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

        # Look for Linux executable file
        for binary in DEFAULT_BIN_DIR.glob("**/stockfish*"):
            if binary.is_file() and os.access(binary, os.X_OK):
                return str(binary.resolve())

    # 3. Check system-wide installed programs (e.g. /usr/games/stockfish on Linux)
    which_path = shutil.which("stockfish")
    if which_path:
        return which_path

    return None


class EngineManager:
    """
    Manages starting and talking to the Stockfish engine.
    Uses UCI (Universal Chess Interface — the standard way programs communicate with chess engines).
    """

    def __init__(self, binary_path: Optional[str] = None):
        # Locate the executable once when the manager is created
        self.binary_path = binary_path or find_stockfish_binary()
        self._engine: Optional[chess.engine.SimpleEngine] = None

    def is_available(self) -> bool:
        """Checks if the Stockfish program file exists and is ready to run."""
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
        Starts a new Stockfish engine process to analyze a game.
        
        Resource Controls:
        - threads: Number of CPU cores to use (set to 2 so it doesn't hog the server).
        - hash_mb: Memory (RAM) cache in Megabytes for calculation trees.
          64 MB is kept small on purpose so it comfortably fits within Render's 512 MB free RAM limit.
        """
        if not self.is_available():
            raise FileNotFoundError(f"Stockfish binary not found. Searched {self.binary_path}")

        # Start the engine process via UCI
        engine = chess.engine.SimpleEngine.popen_uci(self.binary_path)
        try:
            # Apply CPU threads and memory limits
            engine.configure({"Threads": threads, "Hash": hash_mb})
        except Exception:
            pass  # If engine doesn't support specific flags, proceed with defaults
        return engine


# Default ready-to-use manager instance (Singleton: one shared instance across the service)
engine_manager = EngineManager()
