# Set SC type for path finder connection creation
# pylint: disable=undefined-variable

pf_config = db.setting("mywcom.path_finder")

pf_config["splice_closure_type"] = "splice_closure"
pf_config["splice_closure_properties"] = {"specification": "CS-FOSC400-A4-16-1-BNV"}

db.setSetting("mywcom.path_finder", pf_config)
