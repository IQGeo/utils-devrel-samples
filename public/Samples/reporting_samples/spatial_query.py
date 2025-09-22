#! /bin/env python3

import json
from utils import query_spatial, iqgeo_interactive_ropc_auth

def report_features(feature_type, geometry, tolerance=0):
    """
    Generic report function: prints properties of features returned by query_spatial.
    """
    results = query_spatial(feature_type, geometry, tolerance)
    print(f"--- {feature_type.upper()} results ---")
    for f in results.get("features", []):
        props = f.get("properties", {})
        print(props)


if __name__ == "__main__":

    iqgeo_interactive_ropc_auth()
    # Example 1: Point
    point = {"type": "Point", "coordinates": [0.14208, 52.23095]}
    report_features("pole", point, tolerance=60)
    # report_features("conduit", point, tolerance=60)

    # Example 2: LineString
    line = {
        "type": "LineString",
        "coordinates": [
            [0.13422048802249265, 52.220846611354546],
            [0.135095125230265, 52.22157378945272],
            [0.14540334946042321, 52.22735251836545],
        ],
    }
    report_features("pole", line, tolerance=25)

    # Example 3: Polygon
    polygon = {
        "type": "Polygon",
        "coordinates": [[
            [0.1400, 52.2300],
            [0.1450, 52.2300],
            [0.1450, 52.2350],
            [0.1400, 52.2350],
            [0.1400, 52.2300]
        ]]
    }
    report_features("pole", polygon, tolerance=10)

