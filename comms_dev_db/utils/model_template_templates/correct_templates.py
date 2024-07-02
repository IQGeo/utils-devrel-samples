"""
import each file in a folder as a json object
replace the title value with "[name]"
remove geom_indexed and editor_options fields
remove groups, searches, queries, and filters
"""
import os
import json
import sys

# get path from command line
path = sys.argv[1]

# get list of files in path
try:
    files = os.listdir(path)
except FileNotFoundError:
    print("This tool will correct freshly pulled templete files")
    print("Usage: python correct_templates.py <path>")
    sys.exit(1)

# loop through files
for file in files:
    # get file name
    file_name = os.path.join(path, file)
    if ".def" not in file_name:
        continue
    # open file and load json
    with open(file_name, "r") as f:
        json_file = json.load(f)

    # replace title with "[name]"
    json_file["title"] = "[name]"

    if "geom_indexed" not in json_file:
        continue
    # remove geom_indexed and editor_options fields
    json_file.pop("geom_indexed", None)
    json_file.pop("editor_options", None)

    # remove groups, searches, queries, and filters
    json_file.pop("groups", None)
    json_file.pop("searches", None)
    json_file.pop("queries", None)
    json_file.pop("filters", None)

    # write json to file
    with open(file_name, "w") as f:
        json.dump(json_file, f, indent=4)
