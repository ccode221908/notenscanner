from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    data_dir: Path = Path("/data")
    audiveris_jar: Path = Path("/opt/audiveris/lib/audiveris.jar")
    musescore_bin: str = "mscore4"
    java_bin: str = "java"
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
