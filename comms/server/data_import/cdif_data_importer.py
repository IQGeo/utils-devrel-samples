from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.io.myw_csv_feature_istream import MywCsvFeatureIStream
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.data_import.data_importer import DataImporter


class CdifDataImporter(DataImporter):
    """
    Engine for importing data from NM Comms Data Interchange Format

    Just loads records, maps IDs and populates defaults"""

    def run(self):
        """
        Import data into self's view
        """

        # Load records (building ID map)
        self.loadFeatures()

        # Map references to new IDs
        self.mapReferences(self.db_recs)

        # Populate derived fields not present in data
        self.setDerivedFields(self.db_recs)

        return self.db_recs


# ==============================================================================
#                                REGISTRATION
# ==============================================================================

DataImporter.registerEngine("cdif", CdifDataImporter)
