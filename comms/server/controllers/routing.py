def add_routes(config):
    """
    Add REST API routes for this module
    """

    #
    # Feature transactions and updates
    #
    config.add_route("/modules/comms/feature", "mywcom_feature_controller", "transaction")
    config.add_route("/modules/comms/feature/{feature_type}", "mywcom_feature_controller", "insert")
    config.add_route(
        "/modules/comms/feature/{feature_type}/{id}",
        "mywcom_feature_controller",
        "update_delete",
    )

    #
    # Structure and route management
    #
    config.add_route(
        "/modules/comms/structure/{feature_type}/{id}/contents",
        "mywcom_structure_controller",
        "struct_contents",
    )
    config.add_route(
        "/modules/comms/route/{feature_type}/{id}/contents",
        "mywcom_structure_controller",
        "route_contents",
    )
    config.add_route(
        "/modules/comms/route/{feature_type}/{id}/split",
        "mywcom_structure_controller",
        "route_split",
    )
    config.add_route(
        "/modules/comms/structure/{feature_type}/{id}/replace/{new_feature_type}",
        "mywcom_structure_controller",
        "replace_structure",
    )

    #
    # Conduit management
    #
    config.add_route(
        "/modules/comms/conduit/{feature_type}/{id}/chain",
        "mywcom_conduit_controller",
        "continuous_conduits",
    )
    config.add_route("/modules/comms/conduit/path", "mywcom_conduit_controller", "find_path")
    config.add_route(
        "/modules/comms/conduit/{feature_type}/route",
        "mywcom_conduit_controller",
        "route",
    )
    config.add_route(
        "/modules/comms/conduit/{cnd1_ft}/{cnd1_id}/connect/{cnd2_ft}/{cnd2_id}/at/{struct_ft}/{struct_id}",
        "mywcom_conduit_controller",
        "connect",
    )
    config.add_route(
        "/modules/comms/conduit/{conduit_ft}/{conduit_id}/disconnect_at/{struct_ft}/{struct_id}",
        "mywcom_conduit_controller",
        "disconnect",
    )
    config.add_route(
        "/modules/comms/conduit/{feature_type}/{feature_id}/move_to/{housing_ft}/{housing_id}",
        "mywcom_conduit_controller",
        "move_into",
    )

    #
    # Equipment management
    #
    config.add_route(
        "/modules/comms/equip/{equip_ft}/{equip_id}/move_to/{housing_ft}/{housing_id}",
        "mywcom_equipment_controller",
        "move_assembly",
    )
    config.add_route(
        "/modules/comms/equip/{equip_ft}/{equip_id}/copy_to/{housing_ft}/{housing_id}",
        "mywcom_equipment_controller",
        "copy_assembly",
    )
    config.add_route(
        "/modules/comms/equip/{feature_type}/{id}/cables",
        "mywcom_cable_controller",
        "equip_cables",
    )

    #
    # Cable management and routing
    #
    config.add_route("/modules/comms/cable/path", "mywcom_cable_controller", "find_path")
    config.add_route(
        "/modules/comms/cable/{feature_type}/{id}/route",
        "mywcom_cable_controller",
        "route_cable",
    )
    config.add_route(
        "/modules/comms/cable/{feature_type}/{id}/reroute",
        "mywcom_cable_controller",
        "reroute_cable",
    )
    config.add_route(
        "/modules/comms/cable/{feature_type}/{id}/connections",
        "mywcom_cable_controller",
        "connections",
    )
    config.add_route(
        "/modules/comms/cable/{feature_type}/{id}/highest_connected",
        "mywcom_cable_controller",
        "highest_connected",
    )

    config.add_route(
        "/modules/comms/cable/{feature_type}/{feature_id}/split/{seg_id}/{cut_forward}",
        "mywcom_cable_controller",
        "split_cable",
    )
    config.add_route(
        "/modules/comms/cable/{feature_type}/{feature_id}/move_to/{housing_ft}/{housing_id}",
        "mywcom_conduit_controller",
        "move_cable_into",
    )

    config.add_route(
        "/modules/comms/slack/{feature_type}/add",
        "mywcom_cable_controller",
        "add_slack",
    )
    config.add_route(
        "/modules/comms/slack/{feature_type}/split/{id}",
        "mywcom_cable_controller",
        "split_slack",
    )

    #
    # Connectivity management
    #
    config.add_route(
        "/modules/comms/{tech}/connections/{feature_type}/{id}/{side}",
        "mywcom_connectivity_controller",
        "connections",
    )
    config.add_route(
        "/modules/comms/{tech}/paths/{feature_type}/{id}",
        "mywcom_connectivity_controller",
        "paths",
    )
    config.add_route("/modules/comms/{tech}/connect", "mywcom_connectivity_controller", "connect")
    config.add_route(
        "/modules/comms/{tech}/disconnect",
        "mywcom_connectivity_controller",
        "disconnect",
    )
    config.add_route(
        "/modules/comms/{tech}/{feature_type}/{id}/circuits",
        "mywcom_connectivity_controller",
        "circuits",
    )

    #
    # Circuit management
    #
    config.add_route(
        "/modules/comms/circuit/{feature_type}/{id}/route",
        "mywcom_circuit_controller",
        "route_circuit",
    )
    config.add_route(
        "/modules/comms/circuit/{feature_type}/{id}/unroute",
        "mywcom_circuit_controller",
        "unroute_circuit",
    )

    #
    # Delta management
    #
    config.add_route(
        "/modules/comms/delta/{feature_type}/{id}/changes",
        "mywcom_delta_controller",
        "changes",
    )
    config.add_route(
        "/modules/comms/delta/{feature_type}/{id}/conflicts",
        "mywcom_delta_controller",
        "conflicts",
    )
    config.add_route(
        "/modules/comms/delta/{feature_type}/{id}/validate",
        "mywcom_delta_controller",
        "validate",
    )
    config.add_route(
        "/modules/comms/delta/{feature_type}/{id}/merge",
        "mywcom_delta_controller",
        "merge",
    )
    config.add_route(
        "/modules/comms/delta/{delta_owner}/{delta_id}/revert/{feature_type}/{feature_id}",
        "mywcom_delta_controller",
        "revert_feature",
    )
    config.add_route(
        "/modules/comms/delta/{delta_owner}/{delta_id}/rebase/{feature_type}/{feature_id}",
        "mywcom_delta_controller",
        "rebase_feature",
    )
    config.add_route(
        "/modules/comms/delta/{delta_owner}/{delta_id}/merge/{feature_type}/{feature_id}",
        "mywcom_delta_controller",
        "merge_feature",
    )
    config.add_route(
        "/modules/comms/delta/{feature_type}/{id}/bounds",
        "mywcom_delta_controller",
        "bounds",
    )

    config.add_route("/modules/comms/validate", "mywcom_delta_controller", "validate_area")

    #
    # Import/export
    #
    config.add_route(
        "/modules/comms/import/config", "mywcom_data_controller", "data_import_configs"
    )
    config.add_route("/modules/comms/upload", "mywcom_data_controller", "upload_data")
    config.add_route(
        "/modules/comms/upload/{id}/preview",
        "mywcom_data_controller",
        "preview_features",
    )
    config.add_route("/modules/comms/upload/{id}/import", "mywcom_data_controller", "import_upload")

    #
    # Configuration management
    #
    config.add_route("/modules/comms/config/validate", "mywcom_config_controller", "validate")
    config.add_route(
        "/modules/comms/config/validate/{aspect}",
        "mywcom_config_controller",
        "validate_aspect",
    )
    config.add_route(
        "/modules/comms/config/update/{category}",
        "mywcom_config_controller",
        "update_category",
    )

    #
    # Path finder
    #
    config.add_route("/modules/comms/fiber_path/find", "mywcom_path_finder_controller", "find_path")

    config.add_route(
        "/modules/comms/fiber_path/create_circuit",
        "mywcom_path_finder_controller",
        "create_circuit",
    )

    #
    # Task queue management
    #
    config.add_route("/modules/comms/task/{task_id}/status", "iqgapp_task_controller", "status")
    config.add_route("/modules/comms/task/{task_id}/log", "iqgapp_task_controller", "log")
    config.add_route(
        "/modules/comms/task/{task_id}/interrupt", "iqgapp_task_controller", "interrupt"
    )
    config.add_route(
        "/modules/comms/task/{task_id}/status_event/{param}",
        "iqgapp_task_controller",
        "status_event",
    )

    #
    # Line of Count management
    #
    config.add_route(
        "/modules/comms/loc/get",
        "mywcom_loc_controller",
        "get_loc",
    )

    config.add_route(
        "/modules/comms/loc/get_details",
        "mywcom_loc_controller",
        "get_loc_details",
    )

    config.add_route(
        "/modules/comms/loc/update",
        "mywcom_loc_controller",
        "update_loc",
    )

    config.add_route(
        "/modules/comms/loc/{feature_type}/{id}/ripple_trace",
        "mywcom_loc_controller",
        "ripple_trace",
    )

    config.add_route(
        "/modules/comms/loc/{feature_type}/{id}/ripple_trace_update",
        "mywcom_loc_controller",
        "ripple_trace_update",
    )

    config.add_route(
        "/modules/comms/loc/{feature_type}/{id}/ripple_deletions",
        "mywcom_loc_controller",
        "ripple_deletions",
    )

    config.add_route(
        "/modules/comms/loc/{feature_type}/{id}/disconnect_loc",
        "mywcom_loc_controller",
        "disconnect_loc",
    )

    config.add_route(
        "/modules/comms/loc/{feature_type}/{id}/connect_loc",
        "mywcom_loc_controller",
        "connect_loc",
    )

    #
    # TMF style API.
    #
    config.add_route(
        "/modules/comms/api/v1/resourceInventoryManagement/resource/{feature_type}/{id}",
        "mywcom_tmf_controller",
        "with_id",
    )

    config.add_route(
        "/modules/comms/api/v1/resourceInventoryManagement/resource/{feature_type}",
        "mywcom_tmf_controller",
        "no_id",
    )

    config.add_route(
        "/modules/comms/api/v1/networkTrace",
        "mywcom_tmf_controller",
        "network_trace",
    )

    config.add_route(
        "/modules/comms/api/v1/metadata/{specification_file}",
        "mywcom_tmf_controller",
        "metadata",
    )

    config.add_route(
        "/modules/comms/api/v1/metadata/schema/{schema_file}",
        "mywcom_tmf_controller",
        "schema",
    )

