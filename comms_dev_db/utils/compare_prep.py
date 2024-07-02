import json
import sys

import argparse

# Define signature
cli_arg_def = argparse.ArgumentParser()

cli_arg_def.add_argument("file", type=str, help="File to prepare")
cli_arg_def.add_argument(
    "--print", dest="print", action="store_true", help="Print results instead of overwritting file"
)
cli_arg_def.add_argument(
    "--db-changes", dest="db_changes", action="store_true", help="Sort dbchanges geojson"
)
cli_arg_def.add_argument(
    "--no-geom",
    dest="no_geom",
    action="store_true",
    help="Removes geometry from geojson.  Only works in --db-changes mode",
)


def read_file(path):
    with open(path) as f:
        return json.load(f)


def write_file(item, path):
    with open(path, "w") as f:
        json.dump(item, f, indent=2, sort_keys=True)


def sort_item(item, skip_array_sort=False):
    if isinstance(item, list):
        if skip_array_sort:
            sort_array_items(item)
        else:
            sort_array(item)
    elif isinstance(item, dict):
        for prop_value in item.values():
            sort_item(prop_value)
        if "urn" in item:
            if "mywcom_circuit_segment" in item["urn"] or "mywcom_circuit_port" in item["urn"]:
                del item["urn"]


def sort_array(array):
    if len(array) < 1:
        return

    if not isinstance(array[0], dict):
        array.sort()
        return

    # Figure out which keys should be used in the sort
    sortable_keys = []
    for k in array[0]:
        is_valid = True
        for item in array:
            if isinstance(item[k], dict) or isinstance(item[k], list):
                is_valid = False
                break
        if is_valid:
            sortable_keys.append(k)

    # Now sort the array by those keys
    if sortable_keys:
        sortable_keys.sort()

    def sort_func(item):
        return [str(item[k]) for k in sortable_keys]

    array.sort(key=sort_func)

    # Sort each child item's properties
    sort_array_items(array)


def sort_array_items(array):
    # Sort each child item's properties
    for item in array:
        sort_item(item)


def safe_get(item, prop):
    pass


def sort_db_changes(items, no_geom):
    def sort_func(change):
        return (
            change["change_type"],
            change["feature"]["myw"].get("change_type"),
            change["feature"]["myw"].get("delta"),
            change["feature"]["myw"].get("feature_type"),
            change["feature"].get("id"),
        )

    for item in items:
        item["changes"] = sorted(item["changes"], key=sort_func)

        # Remove circuit_segment and circuit_ports.  TODO: Remove this
        item["changes"] = [
            x
            for x in item["changes"]
            if x["feature"]["myw"]["feature_type"]
            not in ["mywcom_circuit_segment", "mywcom_circuit_port"]
        ]

        if no_geom:
            for sub_item in item["changes"]:
                if sub_item.get("feature", {}).get("geometry"):
                    del sub_item["feature"]["geometry"]
                if sub_item.get("orig_feature", {}).get("geometry"):
                    del sub_item["orig_feature"]["geometry"]


cli_args = cli_arg_def.parse_args()

root_item = read_file(cli_args.file)

if cli_args.db_changes:
    sort_db_changes(root_item, cli_args.no_geom)
else:
    sort_item(root_item, True)

if cli_args.print:
    print(json.dumps(root_item, indent=2, sort_keys=True))
else:
    write_file(root_item, cli_args.file)
