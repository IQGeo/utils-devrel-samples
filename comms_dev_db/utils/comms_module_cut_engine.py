# Workaround for Windows-specific problems in dev_tools cut_module
import os
from myworldapp.modules.dev_tools.server.cut.myw_module_cut_engine import MywModuleCutEngine


class CommsModuleCutEngine(MywModuleCutEngine):
    def __init__(self, *cli_args):
        """
        Init slots of self from command line args CLI_ARGS
        """

        super().__init__(*cli_args)

        # Set location for temporary files
        self.tmp_root = "/tmp"
        self.tmp_core_tree = os.path.join(self.tmp_root, self.install_dir)
        self.tmp_modules_tree = self.tmp_core_tree
        self.tmp_module_dir = os.path.join(self.tmp_modules_tree, self.args.module)

        output_name_suffix = self.packages.get(self.args.module, self.args.module)
        self.output_name = "IQGeo_{}_{}".format(output_name_suffix, "v" + self.args.version)
        self.output_file_zip = os.path.join(self.args.output, self.output_name + ".zip")
        self.output_file_tar = os.path.join(self.args.output, self.output_name + ".tar.gz")

    def build(self):
        """
        Build the package
        """

        # Find linux executables
        with self.progress.operation("Marking linux bash scripts"):
            permissions = {}
            for file_path in self.os_engine.find_files(self.tmp_module_dir, "*"):
                if "." in os.path.split(file_path)[-1]:
                    continue

                self.progress(0, "Marking as executable:", file_path)
                permissions[file_path] = 0o755
                self.os_engine.run("chmod", "755", file_path)

        # Build packages
        self.os_engine.build_zip(
            self.output_file_zip, self.tmp_modules_tree, [self.args.module], permissions=permissions
        )

        self.os_engine.run(
            "tar", "-czvf", self.output_file_tar, "-C", self.tmp_modules_tree, self.args.module
        )

        self.progress(1, "Build complete")
