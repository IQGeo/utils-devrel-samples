#! /bin/env python3

import requests
import argparse
import json
from pathlib import Path
from utils import (
    iqgeo_jwt_auth,
    iqgeo_interactive_ropc_auth,
    iqgeo_get_request,
    set_auth_cookies,
    BASE_URL
)


def get_all_conduits(design):
    """Get all conduits in the design"""
    return iqgeo_get_request(f"{BASE_URL}/feature/conduit", design).get("features", [])


def get_cable_segments(conduit_id, design):
    """Get cable segments related to a specific conduit"""
    return iqgeo_get_request(
        f"{BASE_URL}/feature/conduit/{conduit_id}/relationship/cable_segments", 
        design
    ).get("features", [])


def get_cable_diameter(cable_ref, design):
    """ Get cable diameter from cable properties
    ref = e.g. fiber_cable/4
    """
    return (
        iqgeo_get_request(f"{BASE_URL}/feature/{cable_ref}", design)
        .get("properties", {})
        .get("diameter")
    )


def calc_fill_ratio(conduit_diameter, cable_diameters):
    """
    Calculate fill ratio and determine if within limits.

    Implementation of:
    https://www.corning.com/optical-communications/worldwide/en/home/Resources/system-design-calculators/fill-ratio-calculator.html
    """
    if not conduit_diameter or conduit_diameter == 0:
        return None, None
    ratio = sum(d**2 for d in cable_diameters) / (conduit_diameter**2)

    if len(cable_diameters) == 1:
        limit = 0.65
    elif len(cable_diameters) == 2:
        limit = 0.31
    elif len(cable_diameters) == 3:
        limit = 0.40
    else:
        limit = 1.0

    return ratio, limit


def main(token_file, design):
    """script entrypoint."""

    cookies = iqgeo_jwt_auth(token_file)

    set_auth_cookies(cookies)

    capacity_report = {}
    conduits = get_all_conduits(design)

    for conduit in conduits:
        cid = conduit["properties"].get("id")
        conduit_d = conduit["properties"].get("diameter")

        segments = get_cable_segments(cid, design)
        cable_refs = {
            seg["properties"].get("cable")
            for seg in segments
            if seg["properties"].get("cable")
        }

        cable_diameters = []
        for cref in cable_refs:
            d = get_cable_diameter(cref, design)
            if d:
                cable_diameters.append(d)

        # use the printed values to test

        ratio, limit = calc_fill_ratio(conduit_d, cable_diameters)
        if ratio is None:
            status = "No diameter data"
        else:
            percent = f"{ratio*100:.1f}%"
            if ratio <= limit and ratio > 0:
                status = f"{percent} (OK), cable count: {len(cable_refs)}"
            elif ratio == 0:
                status = f"{percent} (EMPTY), cable count: {len(cable_refs)}"
            else:
                status = f"{percent} (OVERFILL), cable count: {len(cable_refs)}"

        capacity_report[f"conduit/{cid}"] = status

    print(json.dumps(capacity_report, indent=2))


if __name__ == "__main__":
    # TODO: import argpase ...
    parser = argparse.ArgumentParser(description="Conduit capacity report")
    parser.add_argument(
        "--token_file",
        type=Path,
        default="token.txt",
        help="Path to the pre-generated JWT token"
    )
    parser.add_argument(
        "--design",
        type=str,
        default=None,
        help="Design ID to use, e.g. design/2FMyDesign"
    )
    args = parser.parse_args()

    main(token_file=args.token_file, design=args.design)