"""Download and parse Slovenian municipality boundaries from GURS.

GURS (Surveying and Mapping Authority of Slovenia) publishes its register of
spatial units (RPE) through a public WFS. Layer SI.GURS.RPE:OB_G holds the
212 municipalities (občine). We request GeoJSON in EPSG:4326 directly, so no
reprojection is needed on our side. License: CC BY 4.0.
"""

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass

WFS_URL = "https://storitve.eprostor.gov.si/ows-pub-wfs/wfs?" + urllib.parse.urlencode(
    {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "SI.GURS.RPE:OB_G",
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
    }
)


@dataclass(frozen=True)
class Municipality:
    id: int
    name: str
    area_km2: float | None
    geometry: dict  # GeoJSON geometry (Polygon or MultiPolygon)


def fetch_geojson(url: str = WFS_URL, timeout: int = 180) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "slovenia-air-gis"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def parse_geojson(geojson_bytes: bytes) -> list[Municipality]:
    collection = json.loads(geojson_bytes)
    municipalities = []
    for feature in collection["features"]:
        props = feature["properties"]
        geometry = feature["geometry"]
        if geometry["type"] not in ("Polygon", "MultiPolygon"):
            raise ValueError(f"Unexpected geometry type {geometry['type']}")
        municipalities.append(
            Municipality(
                id=int(props["OB_ID"]),
                name=props["OB_UIME"],
                area_km2=props.get("POV_KM2"),
                geometry=geometry,
            )
        )
    return municipalities
