from myworldapp.core.server.base.geom.myw_coord_system       import MywCoordSystem
from myworldapp.modules.comms.server.data_import.gpkg_database      import GpkgDatabase
from myworldapp.modules.comms.server.data_import.db_feature_package import DbFeaturePackage

class Exporter():
    ##
    ## Engine to create a GeoPackage from database tables
    ##

    def __init__(self,db_view,file_name,ft_spec='*',coord_sys=None):
        ##
        ## Init slots of self
        ##
        
        self.db_view   = db_view
        self.file_name = file_name
        self.ft_spec   = ft_spec
        self.coord_sys = coord_sys

        self.dd        = self.db_view.db.dd
        self.progress  = self.db_view.db.progress


    def run(self):
        ##
        ## Do export
        ##

        self.progress(1,'Creating',file_name,'...')

        gpkg_db = GpkgDatabase(file_name,'W',self.coord_sys,progress=self.progress)

        for ft in self.dd.featureTypes('myworld',self.ft_spec):
            self.progress(1,'Exporting',ft)

            db_tab   = self.db_view.table(ft)
            db_flds  = db_tab.descriptor.storedFields()
            gpkg_tab = gpkg_db.addTable(ft,db_flds)

            gpkg_tab.insertRecs(db_tab)

            
    def rowFrom(self,rec,db_flds):
        ##
        ## REC in exportable form
        ## 
        # TODO: Fix hardcoded geom field name and remove this

        row = {}
        
        for fld,desc in db_flds.items():
            row[fld] = rec[fld]

        return row
 

    
# Export database to geopackage $1
file_name = args[0]
ft_spec   = args[1]
srid      = int( args[2] )

engine = Exporter(db.view(),file_name,ft_spec,MywCoordSystem(srid))
engine.run()
