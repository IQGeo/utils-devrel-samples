# Copyright (c) 2010-2023 IQGeo Group Plc. Use subject to conditions at $MYWORLD_HOME/Docs/legal.txt

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from myworldapp.core.server.startup.myw_routing_handler import MywRoutingHandler


def add_routes(config: "MywRoutingHandler") -> None:

    config.add_route ("/modules/custom/customerconnection/{pole_id}/{design_id}", "customer_connection_controller", "buildConnections")

    pass
