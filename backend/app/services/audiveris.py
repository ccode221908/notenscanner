"""Audiveris OMR service — subprocess wrapper."""
import asyncio
import logging
import subprocess
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)

AUDIVERIS_BIN = "/opt/audiveris/bin/Audiveris"
TIMEOUT_SECONDS = 900

# Audiveris hard limit: 20 million pixels per sheet.
# We target 18 million to stay safely below it.
AUDIVERIS_MAX_PIXELS = 18_000_000


def _extract_mxl(mxl_path: Path) -> Path:
    """Extract a .mxl (compressed MusicXML) to a .xml file next to it."""
    xml_path = mxl_path.with_suffix(".xml")
    with zipfile.ZipFile(mxl_path) as z:
        score_entry = None
        for name in z.namelist():
            if name.endswith(".xml") and not name.startswith("META-INF"):
                score_entry = name
                break
        if score_entry is None:
            raise RuntimeError(f"No XML found inside {mxl_path}")
        xml_path.write_bytes(z.read(score_entry))
    logger.info("Extracted %s -> %s", mxl_path, xml_path)
    return xml_path


def _get_pdf_page_size_pts(pdf_path: Path) -> tuple[float, float] | None:
    """Return (width_pt, height_pt) of the first page using gs, or None on error."""
    try:
        result = subprocess.run(
            [
                "gs", "-dNOPAUSE", "-dBATCH", "-dQUIET",
                "-sDEVICE=bbox",
                "-dLastPage=1",
                str(pdf_path),
            ],
            capture_output=True, text=True, timeout=30,
        )
        # gs bbox output goes to stderr: "%%BoundingBox: x0 y0 x1 y1"
        for line in result.stderr.splitlines():
            if line.startswith("%%HiResBoundingBox:") or line.startswith("%%BoundingBox:"):
                parts = line.split()
                if len(parts) == 5:
                    w = float(parts[3]) - float(parts[1])
                    h = float(parts[4]) - float(parts[2])
                    return w, h
    except Exception as exc:
        logger.warning("gs bbox failed: %s", exc)
    return None


def _safe_dpi_for_page(width_pt: float, height_pt: float) -> int:
    """Return a DPI that keeps the rasterised page under AUDIVERIS_MAX_PIXELS."""
    import math
    w_in = width_pt / 72.0
    h_in = height_pt / 72.0
    # pixels = (w_in * dpi)^2 * area_ratio <= MAX  =>  dpi <= sqrt(MAX / area)
    max_dpi = math.floor(math.sqrt(AUDIVERIS_MAX_PIXELS / (w_in * h_in)))
    # Cap at 300 DPI (above this adds no OMR benefit); no hard lower bound —
    # for very large pages even 80 DPI still gives thousands of pixels per staff.
    return min(300, max(72, max_dpi))


def _render_pdf_to_pngs(pdf_path: Path, output_dir: Path, dpi: int) -> list[Path]:
    """Render every page of a PDF to individual PNGs using ghostscript."""
    output_dir.mkdir(parents=True, exist_ok=True)
    template = str(output_dir / "page-%04d.png")
    result = subprocess.run(
        [
            "gs", "-dNOPAUSE", "-dBATCH", "-dQUIET",
            "-sDEVICE=png16m",
            f"-r{dpi}",
            f"-sOutputFile={template}",
            str(pdf_path),
        ],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gs render failed: {result.stderr[:500]}")
    pages = sorted(output_dir.glob("page-*.png"))
    if not pages:
        raise RuntimeError("gs produced no PNG pages")
    logger.info("Rendered %d page(s) at %d DPI: %s", len(pages), dpi, output_dir)
    return pages


async def _prepare_input(input_file: Path, work_dir: Path) -> list[Path]:
    """
    Return the list of files to feed to Audiveris.
    For PDFs whose first page exceeds Audiveris's pixel limit, rasterise first.
    """
    suffix = input_file.suffix.lower()
    if suffix != ".pdf":
        return [input_file]

    size = _get_pdf_page_size_pts(input_file)
    if size is None:
        # Can't determine size — let Audiveris try directly
        return [input_file]

    w_pt, h_pt = size
    dpi = _safe_dpi_for_page(w_pt, h_pt)

    # Check if the default Audiveris DPI (72? or the PDF resolution) would exceed limit
    # A4 at 72pt = 595×842 → 595×842 px → 500k pixels, fine.
    # But if the PDF embeds 600 DPI raster images the real size is much bigger.
    # We always rasterise when the page is larger than A3 at 300 DPI or when
    # gs reports dimensions that would exceed the limit at 300 DPI.
    w_in = w_pt / 72.0
    h_in = h_pt / 72.0
    pixels_at_300 = (w_in * 300) * (h_in * 300)
    if pixels_at_300 <= AUDIVERIS_MAX_PIXELS:
        # Page is small enough even at 300 DPI — let Audiveris load the PDF directly
        return [input_file]

    logger.info(
        "PDF page %.1f×%.1f in (%.0fM px at 300 DPI) exceeds limit — "
        "rasterising at %d DPI (%.0fM px)",
        w_in, h_in, pixels_at_300 / 1e6, dpi,
        (w_in * dpi) * (h_in * dpi) / 1e6,
    )
    png_dir = work_dir / "pages"
    pages = await asyncio.get_event_loop().run_in_executor(
        None, _render_pdf_to_pngs, input_file, png_dir, dpi
    )
    return pages


async def run_omr(input_file: Path, output_dir: Path) -> Path:
    """
    Run Audiveris OMR on input_file.
    Returns path to the generated MusicXML file.
    Raises RuntimeError if OMR fails.
    """
    work_dir = output_dir / "work"
    work_dir.mkdir(parents=True, exist_ok=True)

    inputs = await _prepare_input(input_file, work_dir)

    cmd = [
        AUDIVERIS_BIN,
        "-batch",
        "-export",
        "-output", str(output_dir),
        "--",
        *[str(p) for p in inputs],
    ]
    logger.info("Running Audiveris: %s", " ".join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise asyncio.TimeoutError(
            f"Audiveris timed out after {TIMEOUT_SECONDS}s on {input_file}"
        )

    stdout_text = stdout.decode(errors="replace")
    stderr_text = stderr.decode(errors="replace")
    logger.debug("Audiveris stdout: %s", stdout_text)
    logger.debug("Audiveris stderr: %s", stderr_text)

    # Audiveris may produce .xml or .mxl (compressed MusicXML)
    xml_files = list(output_dir.glob("*.xml"))
    mxl_files = list(output_dir.glob("*.mxl"))

    if proc.returncode != 0 or (not xml_files and not mxl_files):
        raise RuntimeError(
            f"Audiveris failed (rc={proc.returncode}): {stderr_text[:1000]}"
        )

    if xml_files:
        logger.info("Audiveris produced XML: %s", xml_files[0])
        return xml_files[0]

    # Extract the first .mxl to .xml
    mxl_files.sort()
    logger.info("Audiveris produced MXL: %s — extracting", mxl_files[0])
    return _extract_mxl(mxl_files[0])
