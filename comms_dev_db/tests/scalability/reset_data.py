"""
Reset data for test run.
- Delete customer drop designs
- Delete customer circuits
"""
# pylint: disable=undefined-variable

from myworldapp.modules.comms.server.api.network_view import NetworkView


view = db.view()
dt = view.table("design")

print("Deleting Customer Drop designs", flush=True)
for d in dt.recs():
    if d.name.startswith("CD_"):
        db_view = db.view(f"design/{d.name}")

        print(f"Deleting design {d.name}", flush=True)

        for feature_type in db.dd.featureTypes("myworld", versioned_only=True, sort=True):

            table = db_view[feature_type]
            n_recs = table.truncate()

        dt.delete(d)


print("Deleting Customer Circuits")
network_view = NetworkView(view)
circuit_mgr = network_view.circuit_mgr

circuits = db.view().table("ftth_circuit")
for c_rec in circuits.recs():
    if c_rec.name.startswith("CC_"):
        print("Deleting ", c_rec)
        circuit_mgr.unroute(c_rec)
        circuits.delete(c_rec)


# db.commit()
