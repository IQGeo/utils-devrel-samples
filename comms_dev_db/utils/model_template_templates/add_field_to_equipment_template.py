"""
Script to add a field to all equipment template feature types
"""


import glob,os,json

module_path = "/opt/iqgeo/platform/WebApps/myworldapp/modules/comms"
search_path = os.path.join(module_path,"models", "**", "*.equip_config")
print(search_path)

for f in glob.iglob(search_path, recursive=True):

    print(f)
    def_file = os.path.splitext(f)[0] + ".def"

    if not os.path.isfile(def_file):
        print("Skipping" , def_file)
        continue



    with open(def_file, "r") as file:
        lines = file.readlines()
        feature_def = json.loads("".join(lines))

    feature_def['fields'].append(
        {
            "name": "directed",
            "external_name": "{:equipment_feature_directed_name}",
            "type": "boolean",
            "mandatory": True,
            "default": True
        })        

    with open(def_file, "w") as file:
        file.writelines(json.dumps(feature_def, indent=4) + "\n")
    

