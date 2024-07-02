"""
This script takes a csv file and converts it into a json file that can be used to
create a model template. The csv should detail all required fields for each object
New Object Name -- New
field_name_for_object, field_name_for_spec

any extra fields the spec or object have that the other doesn't
leave the side of the comma blank

The output of this should be fed into generate_model_template.py along with the csv used to generate this json
"""
import csv
import os
import sys
import json


def add_to_known_types(line):
    if line == "Specification":
        return
    print("Unknown type: " + line)
    print("Please enter a type and an internal name")
    print("Type: ")
    object_type = input()
    print("Internal name: ")
    internal_name = input()
    known_types.update(
        {line: {"type": object_type, "internal_name": internal_name, "external_name": line}}
    )
    print("Adding...\n\n\n")


model_template_templates_folder = (
    os.environ.get("IQG_COMMS_DEV_DB_DIR") + "/utils/model_template_templates"
)
output_folder = os.environ.get("IQG_COMMS_DEV_DB_DIR") + "/utils/model_templates/"

# get path from command line
input_csv = sys.argv[1]

csv_list = []
# import csv file
with open(input_csv, "r") as f:
    csv_file = csv.reader(f, delimiter=",")
    for line in csv_file:
        csv_list.append(line)

"""
When there is a line with " -- NEW" add two dictionaries to the list: feature, and spec
until the next line with " -- NEW" is found. Then, write the feature and spec dictionaries
if the line is empty, don't add a key to the dictionary
"""
known_types = {}
new_known_types = {}
# read in known types from file if it exists
if os.path.isfile(model_template_templates_folder + "/known_types.json"):
    with open(model_template_templates_folder + "/known_types.json", "r") as f:
        known_types = json.load(f)

objects = {}
current_object = ""
try:
    for line in csv_list:
        if " -- New" in line[0]:
            object_name = line[0][:-7].lower().replace(" ", "_")
            current_object = object_name
            objects.update({object_name: {object_name: {}, object_name + "_spec": {}}})
            continue

        spec = False
        for entry in line:
            if entry not in known_types and entry != "":
                add_to_known_types(entry)
            if entry == "":
                continue

            if spec:
                objects[current_object][current_object + "_spec"].update(
                    {
                        "name": known_types[entry]["internal_name"],
                        "external_name": entry,
                        "type": known_types[entry]["type"],
                    }
                )
            else:
                if entry == "Specification":
                    objects[current_object][current_object].update(
                        {
                            "name": "specification",
                            "external_name": "Spec",
                            "type": "foreign_key({})".format(current_object + "_spec"),
                        }
                    )
                else:
                    objects[current_object][current_object].update(
                        {
                            "name": known_types[entry]["internal_name"],
                            "external_name": entry,
                            "type": known_types[entry]["type"],
                        }
                    )
            spec = not spec
    with open(model_template_templates_folder + "/known_types.json", "w") as f:
        json.dump(known_types, f, indent=4)
    print("DONE")
except Exception as e:
    print(e.with_traceback())
    with open(model_template_templates_folder + "/known_types.json", "w") as f:
        json.dump(known_types, f, indent=4)
except KeyboardInterrupt:
    # export known_types to a json file
    with open(model_template_templates_folder + "/known_types.json", "w") as f:
        json.dump(known_types, f, indent=4)
