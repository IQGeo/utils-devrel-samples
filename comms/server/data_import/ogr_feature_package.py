from fnmatch import fnmatch
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor
from myworldapp.core.server.base.geom.myw_geometry import MywGeometry

from .feature_package import FeaturePackage
from myworldapp.core.server.io.myw_ogr_feature_istream import MywOgrFeatureIStream


class OgrFeaturePackage(FeaturePackage):
    ##
    ## A feature package read via the OGR library
    ##
    ## Permits access to ESRI GDB files etc
    ##

    def __init__(self, file_name, file_specs = None,progress=MywProgressHandler()):
        ##
        ## Init slots of self
        ##

        self.file_name = file_name
        self.progress = progress

        with MywOgrFeatureIStream(self.file_name, None, None) as strm:
            self.metadata = {"coord_system": strm.coordSystem().srid}

    def featureTypes(self, name_spec="*"):
        ##
        ## The feature types in self
        ##

        with MywOgrFeatureIStream(self.file_name, None, None) as strm:
            ft_infos = strm.featureTypeInfos()

            fts = []
            for ft in ft_infos:
                if fnmatch(ft, name_spec):
                    fts.append(ft)

            return sorted(fts)

    def featureDesc(self, feature_type):
        ##
        ## Properties of FEATURE_TYPE (a MywFeatureDescriptor)
        ##

        with MywOgrFeatureIStream(self.file_name, None, None) as strm:
            ft_def = strm.featureDef(feature_type)

            return MywFeatureDescriptor.fromDef(ft_def)

    def features(self, feature_type):
        ##
        ## Yield the features of type FEATURE_TYPE
        ##

        desc = self.featureDesc(feature_type)

        with MywOgrFeatureIStream(
            self.file_name, None, desc.primary_geom_name, feature_type=feature_type
        ) as strm:

            for rec in strm:

                # Convert geometry
                # ENH: Return geom from ComsofOgrFeatureIStream
                geom_wkt = rec[desc.primary_geom_name]
                if geom_wkt:
                    rec[desc.primary_geom_name] = MywGeometry.decode(geom_wkt)

                yield rec
