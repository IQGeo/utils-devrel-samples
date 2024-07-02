from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from datetime import datetime


class LogProgressHandler(MywProgressHandler):
    """
    Progress handler that builds a log of progress messages it receives
    """

    def __init__(self, level, timestamps=False, progress=MywProgressHandler):
        """
        Init slots of self

        LEVEL is the maximum message level to log.

        If optional PROGRESS is provided, pass on progress notifications to that"""

        super().__init__()

        self.level = level
        self.timestamps = timestamps
        self.progress = progress
        self.op_stack = []
        self.log_lines = []

    @property
    def op_level(self):
        """
        Depth of operation stack
        """
        return len(self.op_stack)

    @property
    def log(self):
        """
        Self's log as a string
        """
        return "\n".join(self.log_lines)

    def __call__(self, level, *msg, **counts):
        """
        Write progress output (if requested)

        LEVEL is one of:
         <integer> : Verbosity level
         'starting': Start of operation
         'finished': End of operation
         'warning' : Non-fatal warning encountered
         'error'   : Non-fatal error encountered

        COUNTS gives number of objects processed (for 'finished' messages)"""

        # Do bits down the chain
        self.progress(level, *msg, **counts)

        # Stash message
        if level == "warning":
            self.add_line(0, 0, "***Warning***", *msg)

        elif level == "error":
            self.add_line(0, 0, "***Error***", *msg)

        elif level == "starting":
            self.add_line(self.op_level, self.op_level + 1, *msg)
            self.starting_operation(msg)

        elif level == "finished":
            if msg:
                self.add_line(self.op_level, self.op_level + 1, *msg)
            self.finished_operation(msg)

        else:
            self.add_line(self.op_level, self.op_level + level, *msg)

    def starting_operation(self, msg):
        """
        Called when starting a new operation
        """

        op_name = self.format_message(msg).splitlines()[0]
        self.op_stack.append(op_name)

    def finished_operation(self, msg):
        """
        Called when current operation has completed

        COUNTS may optionally give number of objects processed
        """

        self.op_stack.pop()

    def add_line(self, indent_level, msg_level, *msg):
        """
        Add message to log (if appropriate)
        """

        # Check for not of interest to us
        if msg_level > self.level:
            return

        # Build prefix
        time_str = ""
        if self.timestamps:
            time = datetime.now()
            time_str = "[{}] ".format(time.strftime("%H:%M:%S"))

        # For each line of output
        for msg_line in self.format_message(msg).splitlines():
            msg_line = time_str + (indent_level * "   ") + msg_line
            self.log_lines.append(msg_line)  # TODO: Handle indents etc

    def format_message(self, msg):
        """
        Returns MSG as a unicode string (handling errors)

        MSG is a list of objects"""

        # ENH: Duplicated with MywSimpleProgressHandler

        msg_str = ""
        sep = ""

        for item in msg:

            # Handle ident hook
            if hasattr(item, "__ident__"):
                try:
                    item = item.__ident__()
                except Exception:
                    pass

            # Get item as string
            if not isinstance(item, str):
                item = "{}".format(item)

            # Add separator
            if item != "=":
                msg_str += sep

            # Add text
            msg_str += item

            # Set next separator
            if item.endswith("="):
                sep = ""
            else:
                sep = " "

        return msg_str
