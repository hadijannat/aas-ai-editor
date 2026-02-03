"""
Configuration Settings

Load settings from environment variables.
"""

import os
from dataclasses import dataclass


@dataclass
class Settings:
    """Application settings."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Version
    version: str = "0.1.0"

    # CORS
    cors_origins: list[str] = None  # type: ignore

    # Validation
    max_file_size_mb: int = 50
    timeout_seconds: int = 60

    def __post_init__(self) -> None:
        if self.cors_origins is None:
            origins = os.environ.get("CORS_ORIGINS", "*")
            self.cors_origins = [o.strip() for o in origins.split(",")]


def load_settings() -> Settings:
    """Load settings from environment."""
    return Settings(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        debug=os.environ.get("DEBUG", "false").lower() == "true",
        max_file_size_mb=int(os.environ.get("MAX_FILE_SIZE_MB", "50")),
        timeout_seconds=int(os.environ.get("TIMEOUT_SECONDS", "60")),
    )


settings = load_settings()
