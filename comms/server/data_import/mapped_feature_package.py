# Copyright: IQGeo Limited 2010-2023

import os
from fnmatch import fnmatch
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.db.myw_filter_parser import MywFilterParser
from myworldapp.core.server.base.db.myw_expression_parser import MywExpressionParser
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor

from .feature_package import FeaturePackage


class PseudoRecord:
    """
    Wrapper to make a dict look like a record
    """

    # ENH: Extend MywDBPredicate to handle dicts and remove this

    def __init__(self, props):
        self.__props__ = props

        for fld, val in props.items():
            setattr(self, fld, val)


class MappedFeaturePackage(FeaturePackage):
    """
    Wraps another feature package, mapping its feature types

    Provides a way to map source data onto database features."""

    def __init__(self, src_pkg, mappings):
        """
        Init slots of self

        SRC_PKG is a FeaturePackage.
        DB is the target database (a MywDatabase). Used to get target units etc

        MAPPINGS is a list of feature_mappings, with keys:
           feature_type
           src_feature_type
           field_mappings"""

        self.src_pkg = src_pkg
        self.mappings = mappings
        self.progress = src_pkg.progress

    def __str__(self):
        """
        String representation of self for debug messages etc
        """

        return "{}({})".format(self.__class__.__name__, self.src_pkg)

    @property
    def root(self):
        """
        The base feature package in the processing chain
        """

        return self.src_pkg.root

    @property
    def metadata(self):
        """
        Package properties (a dict)
        """

        return self.src_pkg.metadata

    def featureTypes(self, name_spec="*"):
        """
        The feature types in self
        """
        # ENH: Build lookup tables from mappings in init()

        feature_types = set()

        for src_feature_type in self.src_pkg.featureTypes():

            for feature_type, mapping in self._mappingsFrom(src_feature_type):

                if fnmatch(feature_type, name_spec):
                    feature_types.add(feature_type)

        return sorted(feature_types)

    def featureDesc(self, feature_type):
        """
        Properties of FEATURE_TYPE (a MywFeatureDescriptor)
        """

        feature_desc = MywFeatureDescriptor("myworld", feature_type)

        # Add mapped fields
        for src_feature_type, mapping in self._mappingsTo(feature_type):

            field_mappings = mapping.get("field_mappings")
            if not field_mappings:
                continue

            src_feature_desc = self.src_pkg.featureDesc(src_feature_type)

            for fld, src_expr in field_mappings.items():
                if fld in feature_desc.fields:
                    continue

                if src_expr in src_feature_desc.fields:
                    src_fld_desc = src_feature_desc.fields[src_expr]
                    feature_desc.addField(
                        fld, src_fld_desc.type, unit=src_fld_desc.unit
                    )
                else:
                    feature_desc.addField(fld, "string")

        # Add unmapped fields
        for src_feature_type, mapping in self._mappingsTo(feature_type):
            src_feature_desc = self.src_pkg.featureDesc(src_feature_type)

            for fld, src_fld_desc in src_feature_desc.fields.items():
                if fld in feature_desc.fields:
                    continue

                feature_desc.addField(fld, src_fld_desc.type, unit=src_fld_desc.unit)

        return feature_desc

    def features(self, feature_type):
        """
        Yields the features of type FEATURE_TYPE
        """

        # For each package feature type that maps onto type ..
        for src_feature_type, mapping in self._mappingsTo(feature_type):
            src_feature_desc = self.src_pkg.featureDesc(src_feature_type)

            field_mappings = mapping.get("field_mappings")
            filter = mapping.get("filter")

            pred = None
            if filter:
                pred = MywFilterParser(filter).parse()

            # For each record in package feature type ..
            for src_rec in self.src_pkg.features(src_feature_type):
                if not pred is None and not pred.matches(PseudoRecord(src_rec)):
                    continue

                # Build mapped record
                rec = src_rec.copy()
                for fld, src_expr in field_mappings.items():
                    rec[fld] = self.mappedValueFor(fld, src_expr, src_rec)

                yield rec

    def mappedValueFor(self, fld, src_expr, src_rec):
        """
        Build value for field FLD
        """

        # ENH: Build mapping control info up-front (for speed) - see ENHs below

        # Get source value
        parts = MywExpressionParser(src_expr).parse()  # ENH: Do this once upfront
        val = self._evalExpr(parts, src_rec)

        return val
    
    def _evalExpr(self, parts, rec):
        ##
        ## Evaluate myWorld expression PARTS for REC
        ##
        ## PARTS is the result of a call to MywExpressionParser.parse()
        
        if len(parts) == 1 and parts[0][0] == "field":
            fld = parts[0][1]
            val = rec.get(fld)  # ENH: Warn if no such field
        else:
            val = ""
            for el_type, el in parts:
                if el_type == "literal":
                    val += el
                elif el_type == "field":
                    val += str(rec.get(el, "?"))

        return val
   
    def _mappingsFrom(self, src_feature_type):
        ##
        ## The feature types that are mapped from SRC_FEATURE_TYPE (and their mappings)
        ##

        for mapping in self.mappings:
            src_feature_spec = mapping["src_feature_type"]
            
            if ( fnmatch(src_feature_type,src_feature_spec) ):
                yield mapping["feature_type"], mapping

    def _mappingsTo(self, feature_type):
        ##
        ## The source feature types that map to FEATURE_TYPE (and their mappings)
        ##

        for mapping in self.mappings:
            if mapping["feature_type"] == feature_type:

                src_feature_spec  = mapping["src_feature_type"]
                src_feature_types = self.src_pkg.featureTypes(src_feature_spec)

                if not src_feature_types:
                    self.progress(2,feature_type,':','No source tables match:',src_feature_spec)
                    continue
                
                for src_feature_type in src_feature_types:
                    yield src_feature_type, mapping
