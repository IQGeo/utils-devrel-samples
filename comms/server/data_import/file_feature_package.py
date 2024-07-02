# Copyright: IQGeo Limited 2010-2023

import os, codecs, csv
from fnmatch import fnmatch
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor
from myworldapp.core.server.io.myw_feature_istream import MywFeatureIStream

from .feature_package import FeaturePackage


class FileFeaturePackage(FeaturePackage):
    """
    A feature package consisting of a set of files in a directory tree

    Includes support for reading CDIF-specific metadata"""

    # ENH: Move CDIF-specific stuff to subclass?

    def __init__(
        self, data_path, file_specs=["*.csv", "*.shp", "*.geojson"], progress=MywProgressHandler()
    ):
        """
        Init slots of self

        DATA_PATH is the path of either a file or the root directory containing files for the package.
        FILE_SPECS is used to identify feature files within the package
        """

        # TODO: Pass in zip file instead?

        self.dir = data_path
        self.progress = progress
        self.file_specs = file_specs
        self.encoding = "utf8"

        self.field_defs = {}  # Overrides for field descriptors
        self.os_engine = MywOsEngine(self.progress)

    def __str__(self):
        """
        String representation of self for debug messages etc
        """

        return "{}({})".format(self.__class__.__name__, self.dir)

    @property
    def metadata(self):
        """
        Package properties (a dict)
        """

        if not hasattr(self, "_metadata"):
            self._metadata = {}

            metadata_path = os.path.join(self.dir, "package.metadata")
            if os.path.exists(metadata_path):
                for name, values in self.readKeyedCsvFile(metadata_path, "property").items():
                    self._metadata[name] = values["value"]

        return self._metadata

    def featureTypes(self, name_spec="*"):
        """
        The feature types in self
        """

        feature_types = set()

        for feature_type in self.feature_files.values():
            if fnmatch(feature_type, name_spec):
                feature_types.add(feature_type)

        return sorted(feature_types)

    def featureDesc(self, feature_type):
        """
        Properties of FEATURE_TYPE (a MywFeatureDescriptor)
        """

        for file_path, file_feature_type in self.feature_files.items():

            if file_feature_type != feature_type:
                continue

            with open(file_path, "rb") as file:
                first_four_bytes = file.read(4)
                encoding = self.bomToEncoding(first_four_bytes)

            # Get definition from analysis of file
            with MywFeatureIStream.streamFor(
                file_path, "id", "geometry", progress=self.progress, encoding=encoding
            ) as strm:
                feature_def = strm.featureDef(feature_type)

            # Build descriptor
            desc = MywFeatureDescriptor.fromDef(feature_def)

            # Update from metadata (if present)
            for fld, field_def in self.fieldMetadataFor(file_path).items():
                desc.fields[fld].unit = field_def["unit"]

            # Update from overrides
            field_defs = self.field_defs.get(feature_type)
            if field_defs:
                for fld, field_def in field_defs.items():
                    for prop, val in field_def.items():
                        desc.fields[fld][prop] = val

            return desc

    def fieldMetadataFor(self, file_path):
        """
        The metadata for feature data file FILE_PATH (if any)

        Returns a list of dicts, keyed by field name"""

        # Build file name
        path_parts = list(os.path.split(file_path))
        path_parts[-1] = path_parts[-1].split(".")[0] + ".fields"
        # pylint: disable=no-value-for-parameter
        metadata_file_path = os.path.join(*path_parts)

        # Check for does not exist
        if not os.path.exists(metadata_file_path):
            return {}

        # Read it
        return self.readKeyedCsvFile(metadata_file_path, "name")

    def features(self, feature_type):
        """
        Yield the features of type FEATURE_TYPE
        """

        # For each record of requested type ..
        for file_path, file_feature_type in self.feature_files.items():

            if file_feature_type != feature_type:
                continue

            with open(file_path, "rb") as file:
                first_four_bytes = file.read(4)
                encoding = self.bomToEncoding(first_four_bytes)

            self.progress(3, "Reading", file_path)
            with MywFeatureIStream.streamFor(
                file_path, "id", "geometry", progress=self.progress, encoding=encoding
            ) as strm:

                n_recs = 0
                for rec in strm:

                    # Set default change type
                    if not "myw_change_type" in rec:
                        rec["myw_change_type"] = "insert"

                    yield rec

                    n_recs += 1

                self.progress(4, "Read", n_recs, "records", recs=n_recs)

    @property
    def feature_files(self):
        """
        Paths to self's data files (a dict mapping file_path -> feature_type)
        """

        if not hasattr(self, "_feature_files"):
            self._feature_files = {}

            for file_spec in self.file_specs:

                for file_path in self.files(file_spec):
                    file_name = os.path.split(file_path)[-1]
                    feature_type = file_name.split(".")[0]
                    self._feature_files[file_path] = feature_type

        return self._feature_files

    def files(self, file_spec="*"):
        """
        Paths to self's files that match FILE_SPEC
        """

        if not os.path.exists(self.dir):
            raise MywError("No such file:", self.dir)

        self.progress(5, "Finding files under", self.dir, ":", file_spec)
        for file_path in self.os_engine.find_files(self.dir, file_spec):
            yield file_path

    def readKeyedCsvFile(self, file_path, key_field):
        """
        Get contents of a CSV file FILE_PATH as a dict
        """
        # ENH: Pass in expected column names
        # ENH: Pass in expected key names
        # ENH: Warn about duplicate entries

        self.progress(4, "Reading", file_path)

        recs = {}

        with codecs.open(file_path, "r", encoding=self.encoding) as strm:
            reader = csv.DictReader(strm)

            for rec in reader:
                key = rec.pop(key_field)
                recs[key] = rec

        return recs
    
    def bomToEncoding(self, bom):
        """
        Maps the BOM to a small subset of encoding 
        https://docs.python.org/3/library/codecs.html#module-encodings.utf_8_sig
        default is utf-8
        """
        bom_dict = {
            codecs.BOM_UTF32: 'utf_32', # uses native endianness
            codecs.BOM_UTF16_BE: 'utf_32_be', 
            codecs.BOM_UTF16_LE: 'utf_32_le', 
            codecs.BOM_UTF16: 'utf_16',  # uses native endianness
            codecs.BOM_UTF16_BE:'utf_16_be', 
            codecs.BOM_UTF16_LE:'utf_16_le', 
            codecs.BOM_UTF8:'utf_8',
            b'\xef\xbb\xbfi':'utf_8_sig' # Microsoft variant of utf_8
        }

        encoding = 'utf-8'
        if bom in bom_dict:
            encoding = bom_dict[bom]

        return encoding
