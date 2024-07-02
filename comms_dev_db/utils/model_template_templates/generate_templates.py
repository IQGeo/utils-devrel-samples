"""
Generates model templates off a known_types.json file and a csv of the objects to generate
usage:
python3 generate_templates.py <csv_file> <known_types.json>
outputs models to model_templates folder in the utils directory
"""

import csv
import os
import sys
import json

# read in files from command line
csv_file = sys.argv[1]
known_types_file = sys.argv[2]
output_folder = os.environ.get("IQG_COMMS_DEV_DB_DIR") + "/utils/model_templates/"
model_template_templates_folder = (
    os.environ.get("IQG_COMMS_DEV_DB_DIR") + "/utils/model_template_templates"
)
allowed_feature_types = [
    "cable",
    "circuit",
    "conduit",
    "equipment",
    "route",
    "structure",
]
# read in csv to list
csv_list = []
with open(csv_file, "r") as f:
    csv_file = csv.reader(f, delimiter=",")
    for line in csv_file:
        csv_list.append(line)

# read in known types from file
known_types = {}
with open(known_types_file, "r") as f:
    known_types = json.load(f)

current_object = ""
features_to_make = {}
try:
    for line in csv_list:
        if " -- New" in line[0]:
            feature_name = line[0][:-7].lower().replace(" ", "_")
            feature_type = line[1]
            print("{}, {}".format(feature_name, feature_type))
            if feature_type not in allowed_feature_types:
                print("ERROR: {} not in allowed feature types".format(feature_type))
                sys.exit(1)
            feature = {}
            feature_spec = {}
            with open(
                model_template_templates_folder + "/{}_template.def".format(feature_type)
            ) as f:
                feature = json.load(f)

            if feature_type in ["cable", "conduit", "equipment", "structure"]:
                with open(
                    model_template_templates_folder + "/{}_spec_template.def".format(feature_type)
                ) as f:
                    feature_spec = json.load(f)
                feature_spec["name"] = feature_name + "_spec"
                feature_spec["external_name"] = line[0][:-7] + " Spec"

            feature["name"] = feature_name
            feature["external_name"] = line[0][:-7]
            features_to_make.update({feature_name: {"feature": feature, "spec": feature_spec}})
            current_object = feature_name
            continue

        feature_field, spec_field = line
        # check if feature_field is already in features_to_make[current_object]["feature"]["fields"]
        # if it is, skip it
        for field in features_to_make[current_object]["feature"]["fields"]:
            if (
                feature_field in known_types
                and field["name"] == known_types[feature_field]["internal_name"]
            ):
                feature_field = ""

        if spec_field != "":
            for field in features_to_make[current_object]["spec"]["fields"]:
                if (
                    spec_field in known_types
                    and field["name"] == known_types[spec_field]["internal_name"]
                ):
                    spec_field = ""

        if feature_field != "":
            if feature_field == "Specification":
                features_to_make[current_object]["feature"]["fields"].append(
                    {
                        "name": "specification",
                        "external_name": "Spec",
                        "type": "foreign_key({})".format(current_object + "_spec"),
                    }
                )
            else:
                features_to_make[current_object]["feature"]["fields"].append(
                    {
                        "name": known_types[feature_field]["internal_name"],
                        "external_name": known_types[feature_field]["external_name"],
                        "type": known_types[feature_field]["type"],
                    }
                )
        if spec_field != "":
            features_to_make[current_object]["spec"]["fields"].append(
                {
                    "name": known_types[spec_field]["internal_name"],
                    "external_name": known_types[spec_field]["external_name"],
                    "type": known_types[spec_field]["type"],
                }
            )

    # for each feature in features_to_make, write out the feature and spec to a file
    for feature in features_to_make:
        with open(output_folder + "/{}.def".format(feature), "w") as f:
            json.dump(features_to_make[feature]["feature"], f, indent=4)
        if features_to_make[feature]["spec"] != {}:
            with open(output_folder + "/{}_spec.def".format(feature), "w") as f:
                json.dump(features_to_make[feature]["spec"], f, indent=4)

except KeyboardInterrupt:
    print(features_to_make)
except Exception as e:
    print(e.with_traceback())
    print(features_to_make)
