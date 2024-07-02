# Command line utility for executing myWorld Survey module operations
import site, os, sys, codecs

# Add the product root dir to the module search path
product_root_dir = os.getenv("MYW_PRODUCT_ROOT_DIR")
if product_root_dir:
    site.addsitedir(product_root_dir)

# Add myWorld modules to module search path and ensure they have priority over default python paths
from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)

from myworldapp.core.server.startup.myw_python_mods import injectsqlite3dll

injectsqlite3dll()

# TBR: Workaround for PLAT-8642: Core should configure GeoJSON precision
from myworldapp.core.server.startup import myw_python_mods

myw_python_mods.configure_geojson_lib()

# Load code
from myworldapp.modules.comms.server.commands.comms_db_command import CommsDBCommand

# Run command
CommsDBCommand().run(*sys.argv[1:])
