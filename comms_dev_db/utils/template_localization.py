import getopt
import json, sys, os
import subprocess

templates_path = os.environ.get("IQG_COMMS_DIR") + "/models"
model_path = os.environ.get("IQG_COMMS_DIR") + "/public/locales/en/models.msg"
tmp_folder_path = os.path.abspath("/tmp/template_output/")
spec_config_template = (
    '{{"layer": "{spec_type}","ref_feature": "{ref_name}","field_name": "specification"}}'
)

# find_file_paths will return a list of file paths that match the search term
# if recursive is set to true, it will search all subdirectories of the templates_path
def find_file_paths(file_match, recursive=False):
    files_to_edit = []
    for root, subdirs, files in os.walk(templates_path):
        if recursive:
            [
                files_to_edit.append(root + "/" + x)
                for x in files
                if file_match in os.path.splitext(x)[0] and os.path.splitext(x)[1] == ".def"
            ]
        else:
            [files_to_edit.append(root + "/" + x) for x in files if file_match + ".def" == x]

    if not files_to_edit:
        print('No templates were found that matched "' + file_match + '"')
        sys.exit(2)

    return files_to_edit


# localize_files will take a list of file paths and localize the external names
def localize_files(files_to_localize):
    template = {}
    model = {}
    with open(model_path, "r") as model_file:
        model = json.load(model_file)

    inverse_model = {v: k for k, v in model["install"].items() if v}

    for file in files_to_localize:
        with open(file, "r") as template_file:
            template = json.load(template_file)

            output_localized_file(localize_external_names(template, inverse_model), file)

    # add any values from inverse_model that are not in model to model as keys
    # with the keys from inverse_model as values
    for k, v in inverse_model.items():
        if v not in model["install"]:
            model["install"][v] = k

    # write the model file to the tmp folder
    output_localized_file(model, model_path)


"""
create_spec_config creates the spec_config file off of the spec_config_template
saves the .spec_config file to the same folder as the .def file
"""


def create_spec_config(file_name):
    spec_config = {}
    for files in file_name:
        path, file = os.path.split(files)

        if "spec" not in file:
            continue

        layer = ""
        if "cable" in files:
            layer = "mywcom_cable"
        else:
            layer = "mywcom_equipment"

        ref_feature = file.split(".")[0][:-5]
        spec_config = spec_config_template.format(spec_type=layer, ref_name=ref_feature)
        out_file = os.path.join(path, file.split(".")[0] + ".spec_config")
        write_file(out_file, spec_config)


# localize_external_names will take a template and localize the external names
# if the external name is not found in the model, it will create a new external name
# and add it to the model
def localize_external_names(template, model):
    if type(template) is not dict:
        return template

    for k, v in template.items():
        if v and type(v) is str and v[0] == "{":
            continue

        if k == "external_name":
            if v in model:
                template[k] = "{:" + model[v] + "}"
            else:
                template[k] = "{:copper_" + v.lower().replace(" ", "_") + "_field_name}"
                model[v] = "copper_" + v.lower().replace(" ", "_") + "_field_name"
        elif type(v) is list:
            template[k] = [localize_external_names(field, model) for field in v]

    return template


# output_localized_file will take a localized template and output it to a file
# the file will be saved in the tmp_folder_path
def output_localized_file(localized_template, file_name):
    template_out = json.dumps(localized_template, indent=4)
    temp_file_save = os.path.join(tmp_folder_path, os.path.split(file_name)[1])

    if not os.path.isdir(tmp_folder_path):
        os.makedirs(tmp_folder_path)

    with open(temp_file_save, "w+") as template_file:
        template_file.write(template_out)


def check_files(files_to_check):
    if files_to_check == [model_path]:
        subprocess.run(["cdiff", model_path, model_path])
    for file_name in files_to_check:
        temp_file_save = os.path.join(tmp_folder_path, os.path.split(file_name)[1])
        subprocess.run(["cdiff", file_name, temp_file_save])


# accept_files will overwrite the original template files with the localized versions
def accept_files(files_to_accept):
    for file_name in files_to_accept:
        temp_file_save = os.path.join(tmp_folder_path, os.path.split(file_name)[1])
        subprocess.run(["cp", temp_file_save, file_name])
    # save model tmp to model
    subprocess.run(["cp", os.path.join(tmp_folder_path, "models.msg"), model_path])


# cleanup_files will remove the temporary files created by the script
def cleanup_files():
    subprocess.run(["rm", "-rf", tmp_folder_path])


def write_file(file_name, file_contents):
    with open(file_name, "w+") as file:
        file.write(file_contents)


def main(argv):
    """
    getopt search term with flags -r (recursive), -c (check), or -a (accept)
    flag -model will run check on the model file
    cleanup will remove the temporary files created by the script
    """
    recursive = False
    search_term = ""
    try:
        opts, args = getopt.getopt(
            argv, "rcam", ["recursive", "check", "accept", "cleanup", "model", "config"]
        )
        # set search term to the first argument or empty string
        search_term = args[0] if args else ""
    except getopt.GetoptError:
        print("usage: template_localization.py [-r] [-c] [-a] [-m] search_term failed")
        sys.exit(2)
    for opt, arg in opts:
        if opt in ("-r", "--recursive"):
            recursive = True
        elif opt in ("-c", "--check"):
            check_files(find_file_paths(search_term, recursive))
            return
        elif opt in ("-a", "--accept"):
            accept_files(find_file_paths(search_term, recursive))
            return
        elif opt in ("-h", "--help"):
            print("usage: template_localization.py [-r] [-c] [-a] [-m] search_term")

            sys.exit(2)
        elif opt in ("--cleanup"):
            cleanup_files()
            return
        elif opt in ("-m", "--model"):
            check_files([model_path])
            return
        elif opt in ("--config"):
            create_spec_config(find_file_paths(search_term, recursive))
            return

    localize_files(find_file_paths(search_term, recursive))


if __name__ == "__main__":
    main(sys.argv[1:])
