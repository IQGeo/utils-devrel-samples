import json
from myworldapp.core.server.base.core.myw_tabulation import MywTableFormatter
from myworldapp.core.server.base.geom.myw_geometry import MywGeometry
from myworldapp.modules.comms.server.data_import.gpkg_feature_package import GpkgFeaturePackage

file_name = args[0]
what = args[1] if len(args) > 1 else "data"
ft_spec = args[2] if len(args) > 2 else "*"

pkg = GpkgFeaturePackage(file_name, db.progress)

if what == "metadata":
    for key, val in pkg.metadata.items():
        print(key, val)

if what == "features":
    for ft in pkg.featureTypes(ft_spec):
        ftr_desc = pkg.featureDesc(ft)
        print(ft, ":", ftr_desc.primary_geom_field.type)

if what == "fields":
    for ft in pkg.featureTypes(ft_spec):
        for fld, desc in pkg.featureDesc(ft).fields.items():
            print("   ", ft + "." + fld, ":", desc.type)

if what == "def":
    for ft in pkg.featureTypes(ft_spec):
        print(json.dumps(pkg.featureDesc(ft).definition(), indent=3))

if what == "data":
    rows = []
    for ft in pkg.featureTypes(ft_spec):
        row = {"feature": ft, "n_recs": pkg.featureCount(ft)}
        rows.append(row)

    tab_fmtr = MywTableFormatter("feature", "n_recs")
    for line in tab_fmtr.format(rows, "columns"):
        print(line)


if what == "records":
    for ft in pkg.featureTypes(ft_spec):
        ft_desc = pkg.featureDesc(ft)

        rows = []
        for rec in pkg.features(ft):
            rec["feature_type"] = ft

            for prop in rec:
                val = rec[prop]
                if isinstance(val, MywGeometry):
                    rec[prop] = val.wkt

            rows.append(rec)

        if rows:
            tab_fmtr = MywTableFormatter("feature_type", *ft_desc.fields.keys())
            for line in tab_fmtr.format(rows, "columns"):
                print(line)
