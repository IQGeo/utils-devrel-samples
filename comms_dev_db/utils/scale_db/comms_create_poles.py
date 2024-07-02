"""
Script to create random poles within the area of a design. To be used by comms_test_versioning.py in the 
tests/scalability directory.
"""
from sqlalchemy import text
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler


def create_poles(design_urn, design_name, n, progress=None):
    view = db.view(design_urn)

    pole_table = view.table("pole")
    det_pole = pole_table._new_detached()
    det_pole.name = "TEST"
    det_pole.type = "Steel"

    sql = "select (st_dump( st_generatepoints((select boundary from data.design where name = :name limit 1),:n))).geom"

    cnt = 0
    for rec in db.session.connection().execute(text(sql), name=design_name, n=n):
        cnt += 1

        if progress and not (cnt % (n / 100)):
            progress(0, "Poles added: ", cnt)
        det_pole.location = rec.geom
        pole_table.insert(det_pole)


# Create these in France to avoid any chance of interacting with existing data and breaking it.
create_poles("", "France", 20000000, progress=MywSimpleProgressHandler(10))
