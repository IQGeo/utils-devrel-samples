################################################################################
# Comms exceptions
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError


class MywcomError(MywError):
    """
    Superclass for Comms module 'expected' errors (data errors)
    """

    # ENH: Fix server code to raise MywInternalError and remove this?

    pass


class DbConstraintError(MywcomError):
    """
    Raised when a database update cannot be performed because it would create invalid data
    """

    pass
