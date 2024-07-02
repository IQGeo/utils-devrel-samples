###############################################################################
# Command line util for building a patch from a Git tree commit
###############################################################################

import site, os, sys, codecs

# Add myWorld modules to search list
# Move up the tree until we get to the WebApps folder, then add that as a path
webapps_dir = os.path.abspath(__file__)
while webapps_dir and os.path.basename(webapps_dir) != "WebApps":
    webapps_dir = os.path.dirname(webapps_dir)
site.addsitedir(webapps_dir)

from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)

# Import myWorld code
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms_dev_db.utils.comms_patch_builder import CommsPatchBuilder


# Parse args
cli_args = CommsPatchBuilder.cli_arg_def.parse_args()

try:
    b = CommsPatchBuilder(cli_args)
    b.build()
except MywError as cond:
    print("***Error**", cond)
