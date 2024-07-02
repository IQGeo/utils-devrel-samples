# Publish myWorld database $1 to archive dir $2

import sys, shutil, glob, os, subprocess
from datetime import datetime

db = sys.argv[1]
target_dir = sys.argv[2]
archive = sys.argv[3]

# Build name of new file
timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
new_archive_path = os.path.join(target_dir, "{}_{}.backup".format(archive, timestamp))

print("Publishing {} to {}".format(db, new_archive_path))
sys.stdout.flush()

# Save old versions
old_archive_paths = os.path.join(target_dir, archive + "_*.backup")
for old_archive_path in glob.glob(old_archive_paths):
    basename = os.path.basename(old_archive_path)
    print("  Archiving", basename)
    sys.stdout.flush()
    shutil.move(old_archive_path, os.path.join(target_dir, "old", basename))

use_shell = os.name == "nt"
# Publish new version
subprocess.call(["myw_db", db, "backup", new_archive_path], shell=use_shell)
