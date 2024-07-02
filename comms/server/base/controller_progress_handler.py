from myworldapp.core.server.controllers.base.myw_controller_progress import (
    MywControllerProgressHandler,
)


class ControllerProgressHandler(MywControllerProgressHandler):
    """
    Progress handler that writes progress messages to a database record

    Subclass to add operation tee in messages"""

    # ENH: Provide option to do this in MywControllerProgressHandler

    def write_line(self, indent_level, msg_level, *msg):
        """
        Write message (if appropriate)
        """

        # Check for not of interest
        if msg_level > self.level:
            return

        # Build path of current operation
        prefix = []
        for stat in self.stat_stack[1:]:
            prefix += [stat["name"], ":"]

        return super().write_line(indent_level, msg_level, *prefix, *msg)
