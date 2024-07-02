"""
Performs version management tests. 
Example uses:
  - python comms_test_versioning.py --databas iqg_comms_scale --create_batch 100 5 5 5
  - python comms_test_versioning.py --databas iqg_comms_scale --delete_batch
"""
import site, os, sys
import argparse
from datetime import datetime
import math

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        site.addsitedir(site_dir)

from sqlalchemy import text
from shapely.geometry import box


class CommsVersionManagementTests:
    """
    Class to perform version management tests
    """

    def __init__(self, db):
        self.db = db
        self.session = db.session
        self.connection = self.session.connection()

        self.commit_interval = 50

    def create_designs(self, n, inserts, updates, deletes):
        """
        Create N designs using random poles as center point
        """

        pole_ids = self._random_poles(n)

        prefix = datetime.now().strftime("Test %Y%m%Y %H%M%S - ")

        master_view = self.db.view()
        designs_table = master_view.table("design")
        poles_table = master_view.table("pole")

        det_design = designs_table._new_detached()

        earth_radius = 6371008.8  # to match turf
        degrees_to_metres = (2 * math.pi * earth_radius) / 360
        buffer_size = 100 / degrees_to_metres

        commit_interval = self.commit_interval

        self.current_pole_batch_id = 0

        i = 0
        for pole_id in pole_ids:
            i += 1

            pole_rec = poles_table.get(pole_id)
            design_bounds = box(*pole_rec._primary_geom_field.geom().buffer(buffer_size).bounds)

            det_design.name = prefix + str(i)
            det_design._primary_geom_field.set(design_bounds)
            new_rec = designs_table.insert(det_design)

            new_urn = new_rec._urn()

            self._place_random_poles(new_urn, new_rec.name, inserts)
            self._update_random_poles(new_urn, updates)
            self._delete_random_poles(new_urn, deletes)

            print("   Created design ", i, det_design.name)

            if i % commit_interval == 0:
                self._commit()

        self._commit()

    def create(self, design_name, inserts, updates, deletes, width_meters):
        """
        Create named design at random location with given width in metres
        """

        pole_ids = self._random_poles(1)

        master_view = self.db.view()
        designs_table = master_view.table("design")
        poles_table = master_view.table("pole")

        det_design = designs_table._new_detached()

        earth_radius = 6371008.8  # to match turf
        degrees_to_metres = (2 * math.pi * earth_radius) / 360
        buffer_size = width_meters / degrees_to_metres

        self.current_pole_batch_id = 0

        for pole_id in pole_ids:
            pole_rec = poles_table.get(pole_id)
            design_bounds = box(*pole_rec._primary_geom_field.geom().buffer(buffer_size).bounds)

            det_design.name = design_name
            det_design._primary_geom_field.set(design_bounds)
            new_rec = designs_table.insert(det_design)

            new_urn = new_rec._urn()

            self._place_random_poles(new_urn, new_rec.name, inserts)
            self._update_random_poles(new_urn, updates)
            self._delete_random_poles(new_urn, deletes)

            print("   Created design ", det_design.name)

        self._commit()

    def delete_designs(self):
        """
        Deletes auto-generated designs and their contents
        """

        master_view = self.db.view()
        designs_table = master_view.table("design")

        commit_interval = self.commit_interval

        i = 0
        for d in designs_table.filter(designs_table.field("name").like("Test %")):
            i += 1
            view = self.db.view(d._urn())
            n = view.table("pole").truncate()
            designs_table.deleteById(d.name)

            print("    Deleted design ", i, d.name, " with ", n, " pole changes")

            if i % commit_interval == 0:
                self._commit()

        self._commit()

    def delete(self, design_name):
        """
        Deletes specific design
        """

        master_view = self.db.view()
        designs_table = master_view.table("design")

        for d in designs_table.filter(designs_table.field("name") == design_name):
            view = self.db.view(d._urn())
            n = view.table("pole").truncate()
            designs_table.delete(d.name)

            print("    Deleted design ", d.name, " with ", n, " pole changes")

        self._commit()

    def _commit(self):
        """
        Commits and recaches new connection
        """

        print("Committing")
        self.db.commit()
        self.connection = self.session.connection()

    def _place_random_poles(self, design_urn, design_name, n, progress=None):
        """
        Place N random poles inside bounds of design
        """

        if progress:
            progress(0, "Creating poles")

        view = self.db.view(design_urn)

        pole_table = view.table("pole")
        det_pole = pole_table._new_detached()
        det_pole.name = "TEST"
        det_pole.type = "Steel"

        sql = "select (st_dump( st_generatepoints((select boundary from data.design where name = :name limit 1),:n))).geom"

        cnt = 0
        for rec in self.connection.execute(text(sql), name=design_name, n=n):
            cnt += 1

            if progress and not (cnt % (n / 100)):
                progress(0, "Poles added: ", cnt)
            det_pole.location = rec.geom
            pole_table.insert(det_pole)

    def _update_random_poles(self, design_urn, n):
        """
        Updates N poles. Really not random at all
        """

        view = self.db.view(design_urn)
        pole_table = view.table("pole")

        update_fields = {"name": "TEST"}

        for pole_id in self._next_pole_id_batch(n):
            pole_table.updateFrom(pole_id, update_fields)

    def _delete_random_poles(self, design_urn, n):
        """
        Deletes N poles. Really not random at all
        """

        view = self.db.view(design_urn)
        pole_table = view.table("pole")

        for pole_id in self._next_pole_id_batch(n):
            pole_table.deleteById(pole_id)

    def _next_pole_id_batch(self, n):
        """
        Returns a batch of pole IDs
        """

        sql = "SELECT id FROM data.pole WHERE id > :id ORDER BY id LIMIT :n"

        ids = []
        for rec in self.connection.execute(text(sql), id=self.current_pole_batch_id, n=n):
            ids.append(rec["id"])

        if len(ids) > 0:
            self.current_pole_batch_id = ids[-1]

        if len(ids) < n:
            # Ran out of poles, reset. Don't worry about this batch being smaller
            self.current_pole_batch_id = 0

        return ids

    def _random_poles(self, n):
        """
        Return N random poles from master
        """

        num_poles = self.total_poles()
        per = min((float(n) / float(num_poles)) * 100, 100)

        ids = []
        i = 0

        # Looping as sample sometimes gives less than we want
        while i < n:
            # Sampling method that's meant to be fast on very large tables
            sql = "SELECT id FROM data.pole TABLESAMPLE BERNOULLI(:p)"

            for rec in self.connection.execute(text(sql), p=per):
                ids.append(rec["id"])

                i += 1
                if i == n:
                    break

        return ids

    def total_poles(self):
        """
        Returns total number of poles
        """

        print("Counting poles...")
        sql = "SELECT count(*) n FROM data.pole"
        return self.session.execute(sql).fetchone()["n"]


if __name__ == "__main__":

    from myworldapp.core.server.database.myw_database_server import MywDatabaseServer
    from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler

    # Define signature
    cli_arg_def = argparse.ArgumentParser()

    cli_arg_def.add_argument("--database", type=str, help="Database to connect to")
    cli_arg_def.add_argument(
        "--host",
        type=str,
        help="Computer on which PostgreSQL database is located (default: localhost)",
    )
    cli_arg_def.add_argument(
        "--port", type=int, help="Port on which PostgreSQL server listens (default: 5432)"
    )
    cli_arg_def.add_argument(
        "--username", type=str, help="PostgreSQL username to connect with (default: postgres) "
    )
    cli_arg_def.add_argument("--password", type=str, help="Password for PostgreSQL user")

    cli_arg_def.add_argument(
        "--create",
        nargs=5,
        help="Create named designs: <name> <num pole inserts> <num pole updates> <num pole deletes> <meters size>",
    )
    cli_arg_def.add_argument("--delete", nargs=1, help="Create named design and contents")
    cli_arg_def.add_argument(
        "--create_batch",
        nargs=4,
        help="Create designs: <num to create> <num pole inserts> <num pole updates> <num pole deletes>",
    )
    cli_arg_def.add_argument(
        "--delete_batch",
        action="store_true",
        help="Delete all designs and contents that were created as batches",
    )

    # Parse args
    cli_args = cli_arg_def.parse_args()

    print("Creating database server")
    db_server = MywDatabaseServer(
        host=cli_args.host,
        port=cli_args.port,
        username=cli_args.username,
        password=cli_args.password,
    )

    print("Opening database ", cli_args.database)
    db = db_server.open(cli_args.database)

    c = CommsVersionManagementTests(db)

    if cli_args.create_batch:
        c.create_designs(
            int(cli_args.create_batch[0]),
            int(cli_args.create_batch[1]),
            int(cli_args.create_batch[2]),
            int(cli_args.create_batch[3]),
        )

    if cli_args.delete_batch:
        c.delete_designs()

    if cli_args.create:
        c.create(
            cli_args.create[0],
            int(cli_args.create[1]),
            int(cli_args.create[2]),
            int(cli_args.create[3]),
            int(cli_args.create[4]),
        )

    if cli_args.delete:
        c.delete(cli_args.delete[0])
