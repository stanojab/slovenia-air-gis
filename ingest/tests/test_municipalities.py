import json

import pytest

from ingest.municipalities import parse_geojson


def feature(ob_id, name, geometry):
    return {
        "type": "Feature",
        "properties": {"OB_ID": ob_id, "OB_UIME": name, "POV_KM2": 28.54},
        "geometry": geometry,
    }


SQUARE = [[[14.0, 46.0], [14.1, 46.0], [14.1, 46.1], [14.0, 46.1], [14.0, 46.0]]]


def test_parses_polygon_and_multipolygon_features():
    collection = {
        "type": "FeatureCollection",
        "features": [
            feature(40, "Izola", {"type": "Polygon", "coordinates": SQUARE}),
            feature(61, "Ljubljana", {"type": "MultiPolygon", "coordinates": [SQUARE]}),
        ],
    }
    result = parse_geojson(json.dumps(collection).encode())

    assert [(m.id, m.name) for m in result] == [(40, "Izola"), (61, "Ljubljana")]
    assert result[0].area_km2 == 28.54
    assert result[1].geometry["type"] == "MultiPolygon"


def test_rejects_non_polygon_geometry():
    collection = {
        "type": "FeatureCollection",
        "features": [feature(1, "X", {"type": "Point", "coordinates": [14.0, 46.0]})],
    }
    with pytest.raises(ValueError):
        parse_geojson(json.dumps(collection).encode())
