"""MusicXML parsing utilities — part extraction."""
import logging
from pathlib import Path
from typing import List, Tuple
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# MusicXML may use a namespace; we handle both namespaced and bare elements.
_NS_PARTWISE = "http://www.musicxml.org/dtd/partwise"
_NS_MAP = {"mxl": _NS_PARTWISE}


def _find_root(tree: ET.ElementTree) -> ET.Element:
    """Return the root element, stripping any namespace for tag comparison."""
    return tree.getroot()


def _tag_local(element: ET.Element) -> str:
    """Return the local (non-namespaced) tag name of an element."""
    tag = element.tag
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _ns_prefix(element: ET.Element) -> str:
    """Return the namespace prefix string (e.g. '{http://...}') or ''."""
    tag = element.tag
    if "{" in tag:
        return tag[: tag.index("}") + 1]
    return ""


def get_parts(musicxml_file: Path) -> List[Tuple[str, str]]:
    """
    Parse MusicXML and return list of (part_id, part_name) tuples.
    Example: [("P1", "Violin"), ("P2", "Cello")]
    """
    tree = ET.parse(str(musicxml_file))
    root = _find_root(tree)
    ns = _ns_prefix(root)

    parts: List[Tuple[str, str]] = []

    part_list = root.find(f"{ns}part-list")
    if part_list is None:
        logger.warning("No <part-list> found in %s", musicxml_file)
        return parts

    for score_part in part_list.findall(f"{ns}score-part"):
        part_id = score_part.get("id", "")
        name_el = score_part.find(f"{ns}part-name")
        part_name = name_el.text.strip() if (name_el is not None and name_el.text) else part_id
        parts.append((part_id, part_name))
        logger.debug("Found part: id=%s name=%s", part_id, part_name)

    return parts


def extract_part_xml(musicxml_file: Path, part_id: str, output_file: Path) -> Path:
    """
    Write a new MusicXML file containing only the specified part.
    Returns output_file path.
    """
    tree = ET.parse(str(musicxml_file))
    root = _find_root(tree)
    ns = _ns_prefix(root)

    # Prune <part-list>: keep only the matching <score-part>
    part_list = root.find(f"{ns}part-list")
    if part_list is not None:
        for score_part in list(part_list):
            if _tag_local(score_part) == "score-part" and score_part.get("id") != part_id:
                part_list.remove(score_part)

    # Remove all <part> elements that don't match part_id
    for part_el in list(root.findall(f"{ns}part")):
        if part_el.get("id") != part_id:
            root.remove(part_el)

    output_file.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(output_file), encoding="unicode", xml_declaration=True)
    logger.info("Extracted part %s to %s", part_id, output_file)
    return output_file
