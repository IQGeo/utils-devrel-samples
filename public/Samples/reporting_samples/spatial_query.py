#! /bin/env python3

import json
import argparse
from pathlib import Path
from utils import query_spatial, iqgeo_jwt_auth


def report_features(feature_type, geometry, tolerance=0):
    """
    Generic report function: prints properties of features returned by query_spatial.
    """
    results = query_spatial(feature_type, geometry, tolerance)
    print(f"--- {feature_type.upper()} results ---")
    for f in results.get("features", []):
        props = f.get("properties", {})
        print(props)


def main(token_file):

    iqgeo_jwt_auth(token_file)

    # Point
    point = {"type": "Point", "coordinates": [0.14208, 52.23095]}
    report_features("manhole", point, tolerance=60)

    # LineString
    line = {
        "type": "LineString",
        "coordinates": [
            [0.13422048802249265, 52.220846611354546],
            [0.135095125230265, 52.22157378945272],
            [0.14540334946042321, 52.22735251836545],
        ],
    }
    report_features("pole", line, tolerance=25)

    # Polygon
    polygon = {
        "type": "Polygon",
        "coordinates": [
            [
                [0.1400, 52.2300],
                [0.1450, 52.2300],
                [0.1450, 52.2350],
                [0.1400, 52.2350],
                [0.1400, 52.2300],
            ]
        ],
    }
    report_features("pole", polygon, tolerance=10)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Conduit capacity report")
    parser.add_argument(
        "--token_file",
        type=Path,
        default="token.txt",
        help="Path to the pre-generated JWT token",
    )
    args = parser.parse_args()

    main(token_file=args.token_file)
