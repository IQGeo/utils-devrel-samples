# Load data from a GeoPackage into matching tables in DB (truncating existing data)
from myworldapp.modules.comms.server.data_import.file_feature_package import FileFeaturePackage
from myworldapp.modules.comsof.server.base.gpkg_feature_package import GpkgFeaturePackage

file_name = args[0]
ft_spec   = args[1] if len(args) > 1 else '*'
reload    = bool(args[2]) if len(args) > 2 else False

if file_name.endswith('.gpkg'):
    pkg = GpkgFeaturePackage(file_name,progress=db.progress)
else:
    pkg = FileFeaturePackage(file_name,['*.shp'],progress=db.progress)

db_view = db.view()
    
# For each selected feature type ..
for raw_ft in pkg.featureTypes(ft_spec):

    # Find matching table 
    ft  = raw_ft.lower()
    tab = db_view.table(ft,error_if_none=False)

    if not tab:
        db.progress('warning','No such table:',ft)
        continue
        
    with db.progress.operation('Loading',raw_ft,'...'):
    
        if reload:
            db.progress(2,'Dropping existing data')
            tab.truncate()

        # Find string fields (for speed) (see hack below)
        str_flds = []
        for fld,desc in tab.descriptor.storedFields().items():
            if desc.type_desc.base=='string':
                str_flds.append(fld)

        coord_sys = pkg.coord_sys
        
        # Load records
        n_recs = 0
        for rec in pkg.features(raw_ft):

            # Hack to prevent TB on string fields
            for fld in str_flds:
                if fld in rec and rec[fld] != None:
                    rec[fld] = str( rec[fld] )

            tab.insert(rec, coord_sys=coord_sys)
            n_recs += 1

        db.progress(1,ft,n_recs)

db.commit()
