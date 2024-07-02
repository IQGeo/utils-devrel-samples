from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from .feature_package import FeaturePackage


class DbFeaturePackage(FeaturePackage):
    ##
    ## A feature package that is a view of a MywDatabase
    ##

    def __init__(self, db_view, region=None, progress=MywProgressHandler()):
        ##
        ## Init slots of self
        ##
        ## DB_VIEW is a MywFeatureView. Optional REGION is a polygon

        self.db_view = db_view
        self.region = region
        self.progress = progress

        self.dd = self.db_view.db.dd

        self.metadata = {"coord_system": 4326}

    def featureTypes(self, name_spec="*", sort=False):
        ##
        ## The feature types in self
        ##

        return self.dd.featureTypes("myworld", name_spec, sort=sort)

    def featureDesc(self, feature_type):
        ##
        ## Properties of FEATURE_TYPE (a MywFeatureDescriptor)
        ##

        ftr_rec = self.dd.featureTypeRec("myworld", feature_type)

        return self.dd.featureTypeDescriptor(ftr_rec)

    def features(self, feature_type):
        ##
        ## Yield the features of type FEATURE_TYPE
        ##
        # Yields pseudo records (workaround for problems in MappedFeaturePackage)

        tab = self.db_view.table(feature_type)
        flds = tab.descriptor.storedFields()
        recs = tab

        if self.region:
            geom_field = tab.descriptor.primary_geom_name
            if not geom_field:
                return []

            pred = tab.field(geom_field).geomIntersects(self.region)
            recs = recs.filter(pred)

        for rec in recs:

            vals = {}
            for fld, desc in flds.items():
                if desc.isGeometry():
                    vals[fld] = rec._field(fld).geom()
                else:
                    vals[fld] = rec[fld]

            yield (vals)
