###############################################################################
# Wrapper to utility to build a myWorld module release package
###############################################################################

import sys, os, site


# ------------------
#  Init Environment
# ------------------

# Vile hack to get import path right # TODO: Find a better way
# Move up the tree until we get to the WebApps folder, then add that as a path
webapps_dir = os.path.dirname(__file__)
while os.path.basename(webapps_dir) != "WebApps":
    webapps_dir = os.path.dirname(webapps_dir)
site.addsitedir(webapps_dir)

from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)

# Import engine
from myworldapp.modules.comms_dev_db.utils.comms_module_cut_engine import CommsModuleCutEngine


# ------------------
#  Run Command
# ------------------

eng = CommsModuleCutEngine(*sys.argv[1:])
eng.run()
