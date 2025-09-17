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
    get_all_features,
    BASE_URL
)


def get_pole_equipment(pole_id, design):
    """Get equipment attached to a specific pole"""
    return iqgeo_get_request(
        f"{BASE_URL}/feature/pole/{pole_id}/relationship/equipment", design
    ).get("features", [])


def get_pole_routes(pole_id, design):
    """Get routes associated with a specific pole"""
    return iqgeo_get_request(
        f"{BASE_URL}/feature/pole/{pole_id}/relationship/routes", design
    ).get("features", [])


def main(token_file, design):
    """script entrypoint."""

    cookies = iqgeo_jwt_auth(token_file) # or iqgeo_interactive_ropc_auth()
    set_auth_cookies(cookies)

    # custom report section
    attachment_report = {}
    poles = get_all_features(feature_type="pole", design=design)

    for pole in poles:
        pid = pole["properties"].get("id")

        equipment = get_pole_equipment(pid, design)
        routes = get_pole_routes(pid, design)

        equip_list = [e["properties"].get("name") for e in equipment if e.get("properties")]
        route_list = [r["properties"].get("id") for r in routes if r.get("properties")]

        attachment_report[f"pole/{pid}"] = {
            "equipment_count": len(equip_list),
            "equipment": equip_list,
            "route_count": len(route_list),
            "routes": route_list,
        }

    print(json.dumps(attachment_report, indent=2))


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