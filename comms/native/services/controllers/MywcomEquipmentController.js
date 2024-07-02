//##############################################################################
// Controller for managing equipment
//##############################################################################
// Copyright: IQGeo Limited 2010-2023

import MywcomController from './MywcomController';

/**
 * Controller for managing equipment
 */
class MywcomEquipmentController extends MywcomController {
    /**
     * Initialize slots of self
     */
    constructor(request) {
        super(request, 'EQUIP');
    }

    // ==============================================================================
    //                                  ASSEMBLIES
    // ==============================================================================
    //@view_config(route_name='mywcom_equipment_controller.move_assembly', request_method='POST')
    /**
     * Move equipment (and its children) to housing
     */
    async move_assembly(routeParams, params) {
        return this.runInTransaction(() => this._move_assembly(routeParams, params));
    }

    async _move_assembly(routeParams, params) {
        // Unpick parameters
        const equip_feature_type = routeParams.equip_ft;
        const equip_id = routeParams.equip_id;
        const housing_feature_type = routeParams.housing_ft;
        const housing_id = routeParams.housing_id;
        const delta = params.delta;

        this.progress(
            2,
            'Moving assembly',
            equip_feature_type,
            equip_id,
            '->',
            housing_feature_type,
            housing_id
        );

        // Get manager
        const db_view = this.db.view(delta);
        const equip_mgr = this.networkView(db_view).equip_mgr;

        // Get records
        const equip_rec = await this.featureRec(db_view, equip_feature_type, equip_id);
        const housing_rec = await this.featureRec(db_view, housing_feature_type, housing_id);

        // Move assembly
        const response = await equip_mgr.moveAssembly(equip_rec, housing_rec);
        return response;
    }

    //@view_config(route_name='mywcom_equipment_controller.copy_assembly', request_method='POST', renderer='json')
    /**
     * Copy equipment (and its children) to housing
     *
     * Returns geoJSON for new equipment
     */
    async copy_assembly(routeParams, params) {
        return this.runInTransaction(() => this._copy_assembly(routeParams, params));
    }

    async _copy_assembly(routeParams, params) {
        // Unpick parameters
        const equip_feature_type = routeParams.equip_ft;
        const equip_id = routeParams.equip_id;
        const housing_feature_type = routeParams.housing_ft;
        const housing_id = routeParams.housing_id;
        const delta = params.delta;

        this.progress(
            2,
            'Copying assembly',
            equip_feature_type,
            equip_id,
            '->',
            housing_feature_type,
            housing_id
        );

        // Get manager
        const db_view = this.db.view(delta);
        const equip_mgr = this.networkView(db_view).equip_mgr;

        // Get records
        const equip_rec = await this.featureRec(db_view, equip_feature_type, equip_id);
        const housing_rec = await this.featureRec(db_view, housing_feature_type, housing_id);

        // Copy assembly
        const new_equip = await equip_mgr.copyAssembly(equip_rec, housing_rec);

        return new_equip.asGeojsonFeature(/*include_lobs=*/ false);
    }
}

export default MywcomEquipmentController;
