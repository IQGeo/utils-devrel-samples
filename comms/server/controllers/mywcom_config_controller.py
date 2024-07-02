###############################################################################
# Controller for managing config
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import json
import re
from pyramid.view import view_config

from myworldapp.modules.comms.server.api.mywcom_error import MywcomError
from myworldapp.modules.comms.server.config.config_validator import ConfigValidator
from myworldapp.modules.comms.server.config.config_manager import ConfigManager

from .utils import handling_exceptions
from .mywcom_controller import MywcomController


class MywcomConfigController(MywcomController):
    """
    Controller for running config validation
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "CONFIG")

    @view_config(
        route_name="mywcom_config_controller.validate", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def validate(self):
        """
        Validate all comms configuration

        Returns errors and warnings from config validation engine
        keyed on config aspect i.e. mywcom.equipment or mywcom.structures"""

        # Check authorised
        self.current_user.assertAuthorized(self.request, application="config")

        # get the config object from client
        props = json.loads(self.request.body)
        config = props.pop("config")

        # set warn to true
        warn = True

        # Find validation problems
        engine = ConfigValidator(self.db, self.progress, warn)
        errors = engine.run("*", config)

        return {"errors": errors}

    @view_config(
        route_name="mywcom_config_controller.validate_aspect",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def validate_aspect(self):
        """
        Validate comms configuration for aspect

        Returns errors and warnings from config validation engine"""

        # Check authorised
        self.current_user.assertAuthorized(self.request, application="config")

        # get the config object from client
        aspect = self.get_param(self.request, "aspect")
        props = json.loads(self.request.body)
        config = props.pop("config")

        # set warn
        warn = True

        # Find validation problems
        engine = ConfigValidator(self.db, self.progress, warn)
        errors = engine.run(aspect, config)

        # Build result
        return {"errors": errors}

    @view_config(
        route_name="mywcom_config_controller.update_category", request_method="PUT", renderer="json"
    )
    @handling_exceptions
    def update_category(self):
        """
        Update comms configuration for a given category

        Also updates feature definitions etc (via ConfigManager)"""

        # Check authorised
        self.current_user.assertAuthorized(self.request, application="config")

        # Get new definition
        category = self.get_param(self.request, "category")
        props = json.loads(self.request.body)
        new_configs = props.pop("config")

        # Create engine
        mgr = ConfigManager(self.db, self.progress)

        # Get current value
        # ENH: Get from manager
        setting_name = "mywcom." + category
        old_configs = self.db.setting(setting_name)
        if old_configs is None:
            raise MywcomError("no_such_setting", name=setting_name)

        info = []

        # Add or update entries
        for feature_type, config in new_configs.items():
            image = config.pop("image", None)

            sp_image = config.pop(
                "structurePaletteImage", None
            )  # ENH: Rename setting members and remove these
            in_equips = config.pop("inEquips", None)
            out_equips = config.pop("outEquips", None)

            if category == "structures":
                info.append(mgr.addStructType(feature_type, image, None, **config))
            elif category == "routes":
                info.append(mgr.addRouteType(feature_type, image, None, **config))
            elif category == "equipment":
                info.append(mgr.addEquipType(feature_type, image, None, None, **config))
            elif category == "conduits":
                info.append(
                    mgr.addConduitType(
                        feature_type, image, None, structure_palette_image=sp_image, **config
                    )
                )
            elif category == "cables":
                info.append(mgr.addCableType(feature_type, image, None, None, **config))
            elif category == "circuits":
                info.append(
                    mgr.addCircuitType(
                        feature_type,
                        image,
                        None,
                        in_equips=in_equips,
                        out_equips=out_equips,
                        **config,
                    )
                )
            else:
                raise MywcomError("bad_category", name=category)

        # Remove entries no longer required
        for feature_type in old_configs:
            if feature_type in new_configs:
                continue

            if category == "structures":
                info.append(mgr.removeStructType(feature_type))
            elif category == "routes":
                info.append(mgr.removeRouteType(feature_type))
            elif category == "equipment":
                info.append(mgr.removeEquipType(feature_type))
            elif category == "conduits":
                info.append(mgr.removeConduitType(feature_type))
            elif category == "cables":
                info.append(mgr.removeCableType(feature_type))
            elif category == "circuits":
                info.append(mgr.removeCircuitType(feature_type))
            else:
                raise MywcomError("bad_category", name=category)

        self.db.commit()

        # Build result
        return {"info": info}
