# Copyright: IQGeo Limited 2010-2023
import traceback
from pyramid.view import view_config
from functools import wraps
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.controllers.base.myw_utils import mywAbort
from myworldapp.core.server.dd.myw_feature_model_mixin import MywFeatureModelMixin

from myworldapp.modules.comms.server.api.mywcom_error import MywcomError
from myworldapp.modules.comms.server.api.pin_range import PinRange


def handling_exceptions(meth):
    """
    Controller decorator mapping MywError exceptions to MywAbort calls
    """

    @wraps(meth)
    def wrapper(controller, *args, **kwargs):
        """
        Run CONTROLLER.METH() raising MywAbort if exception
        """

        try:
            return meth(controller, *args, **kwargs)

        except MywcomError as cond:

            # Map args to json serialisable objects
            # ENH: Replace by hook method on objects or similar
            params = {}
            for key, val in cond.kwargs.items():
                if isinstance(val, MywFeatureModelMixin):
                    val = val._title()
                elif isinstance(val, PinRange):
                    val = val.spec
                params[key] = val

            mywAbort(cond, **params)

        except MywError as cond:
            if hasattr(controller, "progress"):
                controller.progress("error", cond, cond.kwargs, traceback=traceback)

            mywAbort(cond)

    return wrapper
