import os, re
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.dev_tools.tools.myw_patch_builder import MywPatchBuilder


class CommsPatchBuilder(MywPatchBuilder):
    """
    Command line util for building a patch from a Git tree commit

    Subclassed to handle comms multi-module repo + override output directory"""

    def __init__(self, args):
        """
        Init slots of self
        """

        # COMMS: Set this here so it is accessible in .git_environment()
        self.module = args.module or "comms"

        # Do super
        super().__init__(args)

        # COMMS: Override output directiory
        self.output_dir = args.output or self.default_output_dir()
        self.output_file = os.path.join(self.output_dir, self.patch_id + ".mpf")

        if os.path.exists(self.output_file) and not self.overwrite:
            raise MywError("File already exists: " + self.patch_id)

    def default_output_dir(self):
        """
        Default location for patch
        """

        patch_root = os.getenv("MYW_PATCH_ROOT")

        path = os.path.join(patch_root, "v" + self.version, "patches", self.module)

        return os.path.normpath(path)

    def add_change(self, file_name, change_code):
        """
        Add changes to FILE_NAME to the zip (if appropriate)

        CHANGE_CODE indicates the change made ('A', 'M', or 'D')

        Add file in either (or both) trees:
          new  Patch version of file
          old  Expected version of file"""

        # Overwritten to fix bug in 'wrong module' test

        dev_paths = [
            "/_shipped/",  # Excluded in cut
            "^_unshipped/",
            "/_unshipped/",
            "/_tests/",
            "/tilestore/java/.*\.java$",
            "/tilestore/java/.*\.bat$",
            "/core/public/js-min/.*\.js",  # Get built when patch installed
            "/core/public/js-min/.*\.js.map",
            "myworldapp/modules/dev_db/",
            "myworldapp/modules/scale_test_db",
        ]

        # Case: Internal file
        for path in dev_paths:
            if re.search(path, file_name):
                self.progress(2, "Skipping:", file_name)
                return False

        # Case: Inappropriate file
        if self.module == "core":
            if "myworldapp/modules" in file_name:
                self.progress("warning", "Not core:", file_name)
                return False
        else:
            # COMMS: WORKAROUND for core issue 23332
            # TBR: PLAT-8001
            # if not 'myworldapp/modules/'+self.module in file_name:
            if not "myworldapp/modules/" + self.module + "/" in file_name:
                # COMMS: END
                self.progress("warning", "Wrong module:", file_name)
                return False

        # Case: Commit missing or out of sequence
        prev_commit = None
        for commit in self.commits:
            if prev_commit and not self.git_versions_match(
                file_name, prev_commit, "new", commit, "old"
            ):
                raise MywError(
                    file_name,
                    ": base revision not as expected for",
                    commit,
                    "(commit missing or order wrong?)",
                )
            prev_commit = commit

        # Case: New file
        if change_code == "A":
            self.add_file_version("new", file_name)

        # Case: Modified file
        elif change_code == "M":
            self.add_file_version("old", file_name)
            self.add_file_version("new", file_name)

        # Case: Deleted file
        elif change_code == "D":
            self.add_file_version("old", file_name)

        else:
            raise Exception("Unknown change code: " + change_code)

        return True

    def git_environment(self):
        """
        Determines if git tree holds whole product or just a module

        Returns:
          MODULE      Name of module ('core' for full product)
          GIT_PREFIX  Prefix to add to git paths to get preduct-relative path"""

        return self.module, "WebApps/myworldapp/modules/"
