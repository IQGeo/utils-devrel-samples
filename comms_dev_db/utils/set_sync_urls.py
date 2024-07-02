# Add additional sync url to replication.sync_urls setting
# Allows the use of IQGeo Anywhere on host machine with IQGeo server running in devcontainer

import os
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler

# pylint: disable=undefined-variable

# Helper to get a positional script arg
def script_arg(n, default=None):
    if n < len(args):
        return args[n]
    return default


# Unpick args
trace_level = int(script_arg(0, "2"))

# Run check
progress = MywSimpleProgressHandler(trace_level)
progress(1, "------------------------")
progress(1, "Setting localhost sync url")
progress(1, "------------------------")

setting = db.setting("replication.sync_urls")

port = os.environ["APP_PORT"] or 82
sync_host = os.environ.get("SYNC_HOST", "localhost")
url = f"http://{sync_host}:{port}"
new_url = {"name": "localhost", "url": url}

if setting and new_url not in setting:
    progress(1, "Adding ", new_url, "to replication.sync_urls")
    setting.append(new_url)
    db.setSetting("replication.sync_urls", setting)
