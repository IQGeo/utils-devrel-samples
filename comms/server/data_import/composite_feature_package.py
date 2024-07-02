from fnmatch import fnmatch
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from .feature_package import FeaturePackage


class CompositeFeaturePackage(FeaturePackage):
    ##
    ## Feature package that makes a set of feature packages appear as one
    ##

    def __init__(self, src_pkgs, progress=MywProgressHandler):
        ##
        ## Init slots of self
        ##

        self.src_pkgs = src_pkgs
        self.progress = progress

        if src_pkgs:
            self.metadata = src_pkgs[0].metadata
        else:
            self.metadata = {}

    def featureTypes(self, name_spec="*"):
        ##
        ## The feature types in self
        ##

        feature_types = set()

        for src_pkg in self.src_pkgs:
            for ft in src_pkg.featureTypes(name_spec):
                feature_types.add(ft)

        return sorted(feature_types)

    def featureDesc(self, feature_type):
        ##
        ## Properties of FEATURE_TYPE (a MywFeatureDescriptor)
        ##
        ## Returns first found

        for src_pkg in self.src_pkgs:
            for ft in src_pkg.featureTypes(
                feature_type
            ):  # ENH: Cache feature types on self (for speed)
                return src_pkg.featureDesc(ft)

    def features(self, feature_type):
        ##
        ## Yield the features of type FEATURE_TYPE
        ##

        for src_pkg in self.src_pkgs:
            for ft in src_pkg.featureTypes(
                feature_type
            ):  # ENH: Cache feature types on self (for speed)
                for rec in src_pkg.features(feature_type):
                    yield rec
