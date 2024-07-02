import logging, tempfile, os, sys
from datetime import datetime

from myworldapp.modules.comms.server.api.network_view import NetworkView


class SQLTableNameQueryCounts:
    """
    Class intended to parse tablenames from a file that contains
    SQL queries

    Simplistic and does not handle things like commented out sections of queries
    or multiple table names listed for cartesian joins"""

    def __init__(self, filename):
        self.filename = filename

    def tablenames(self):
        with open(self.filename, "r") as in_stream:
            tablenames = self._tablenames(in_stream)

        return tablenames

    def _tablenames(self, in_stream):

        next_is_tablename = False

        table_counts = {}

        for line in in_stream:
            words = line.lower().split()

            for word in words:
                if next_is_tablename:
                    # Currently expecting a tablename (following a SELECT or JOIN)
                    if "(" not in word:  # If there is a ( that means a subquery, so not a tablename
                        tablename = word.replace(",", "")

                        if table_counts.get(tablename) is None:
                            table_counts[tablename] = 0
                        table_counts[tablename] += 1

                    next_is_tablename = False

                elif word in ["from", "join"]:
                    next_is_tablename = True

        return table_counts


class RouteTraceTester:
    """
    Class that runs route level tracing and reports number of queries by table"""

    def __init__(self, db, trace_request, title_prefix=""):
        self.trace_request = trace_request

        delta = trace_request["delta"]

        if delta:
            self.db_view = db.view(delta)
        else:
            self.db_view = db.view()

        self.title_prefix = title_prefix
        self.log_handler = None
        self.log_stream = None

    def _structures(self):
        """
        Returns structure feature instances to use with trace"""

        structure_urns = self.trace_request["structure_urns"]

        structures = []
        for urn in structure_urns:
            struct = self.db_view.get(urn)

            if not struct:
                print("ERROR: Feature doesn't exist ", urn)
                sys.exit(1)

            structures.append(struct)

        return structures

    def _cable(self):
        """
        Returns cable for trace"""

        cable_urn = self.trace_request["cable_urn"]

        if not cable_urn:
            return

        cable = self.db_view.get(cable_urn)

        if not cable:
            ("ERROR: Feature doesn't exist ", cable_urn)
            sys.exit(1)

    def routeCable(self):
        """
        Runs/reports on the cable manager find path"""

        log_filename = self._setup_logging()

        start_datetime = datetime.now()

        cable_mgr = NetworkView(self.db_view).cable_mgr

        structures = self._structures()

        # pylint: disable=assignment-from-none
        cable = self._cable()

        routes = cable_mgr.findPath(structures)

        if cable:
            cable_mgr.update_route(cable, True, *routes)

        end_datetime = datetime.now()

        self._cleanup_logging()

        self._reportCounts(log_filename, end_datetime - start_datetime)

    def findPath(self):
        """
        Runs/reports on running the underlying trace engine that the cable manager would use
        Idea being to see if the cable manager adds much overhead"""

        log_filename = self._setup_logging()

        start_datetime = datetime.now()

        cable_mgr = NetworkView(self.db_view).cable_mgr

        structures = self._structures()

        routes = cable_mgr.findPath(structures)

        end_datetime = datetime.now()

        self._cleanup_logging()

        self._reportCounts(log_filename, end_datetime - start_datetime)

    def _reportCounts(self, log_filename, run_time):
        """
        Prints out the results"""

        table_counts = SQLTableNameQueryCounts(log_filename).tablenames()

        # Totals
        total_non_pg_myw_queries = 0
        total_non_pg_queries = 0

        for tablename, count in table_counts.items():
            if not tablename.startswith("pg"):
                total_non_pg_queries += count

                if not tablename.startswith("myw"):
                    total_non_pg_myw_queries += count

        # Build a nice title
        title = self.title_prefix + self.trace_request["title"]
        if self.db_view.delta:
            title += " Delta = " + self.db_view.delta
        else:
            title += " Delta = MASTER"

        print()
        print()
        print("Trace : ", title)
        print("Total Queries (non PG-tables or MYW) : ", total_non_pg_myw_queries)
        print("Total Queries (non PG-tables)        : ", total_non_pg_queries)
        print("Processing time (s)                  : ", run_time.seconds)
        print("Raw query filename                   : ", log_filename)
        print("Query counts : ")

        sorted_tablenames = sorted(table_counts.keys())
        for tablename in sorted_tablenames:
            print("    {t},{c}".format(t=tablename, c=table_counts[tablename]))

    def _setup_logging(self):
        """
        Add logging handler to SQLAlchemy logging to write to a temp file"""

        self._cleanup_logging()

        sql_logger = logging.getLogger("sqlalchemy.engine.base.Engine")
        sql_logger.setLevel(logging.INFO)

        # Open temp file stream
        self.log_stream = tempfile.NamedTemporaryFile(delete=False, mode="w")

        # Build and attach log handler to output to temp file stream
        self.log_handler = logging.StreamHandler(self.log_stream)
        self.log_handler.setLevel(logging.INFO)
        sql_logger.addHandler(self.log_handler)

        return self.log_stream.name  # The log filename

    def _cleanup_logging(self):
        """
        Cleanup additional logging handler (if any)"""

        sql_logger = logging.getLogger("sqlalchemy.engine.base.Engine")

        if self.log_handler:
            self.log_handler.close()

            sql_logger.removeHandler(self.log_handler)

            self.log_handler = None

        if self.log_stream:
            self.log_stream.close()

            # Commented out to leave temp files around
            # os.unlink(self.log_stream.name)

            self.log_stream = None


#
# Get traces to perform from file, filename should be last arg
#
trace_requests = []

requests_filename = sys.argv[-1]

print("READING FILE: ", requests_filename)

bad_file = False
with open(requests_filename, "r") as input_stream:
    first = True
    for line in input_stream:

        if first:
            first = False
            continue

        tokens = line.split(",")

        if len(tokens) != 4:
            print("ERROR : Skipping line ", line)
            bad_file = True
            continue

        trace_requests.append(
            {
                "title": tokens[0],
                "delta": tokens[1],
                "cable_urn": tokens[2],
                "structure_urns": tokens[3].split(";"),
            }
        )

if bad_file:
    print("ERROR: File has problems, exiting")
    sys.exit(1)

# pylint: disable=undefined-variable
for trace_request in trace_requests:

    print()
    print("Processing: ", trace_request["title"])

    tester = RouteTraceTester(db, trace_request)
    tester.routeCable()

    print()
    print("Processing: ", "RAW TRACE", trace_request["title"])

    tester = RouteTraceTester(db, trace_request, "RAW TRACE ")
    tester.findPath()
