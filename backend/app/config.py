from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    data_dir: Path = Path("/data")
    audiveris_bin: str = "/opt/audiveris/bin/Audiveris"  # batch-mode OMR launcher
    musescore_bin: str = "snap run musescore"             # requires DISPLAY=:99 (Xvfb)
    xvfb_display: str = ":99"                             # virtual framebuffer display
    host: str = "0.0.0.0"
    port: int = 8000

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def scores_dir(self) -> Path:
        return self.data_dir / "scores"

    model_config = {"env_file": ".env"}

settings = Settings()
