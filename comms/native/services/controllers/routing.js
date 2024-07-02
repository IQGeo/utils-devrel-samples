import { routing } from 'myWorld-native-services';
import MywcomStructureController from './MywcomStructureController';
import MywcomConnectivityController from './MywcomConnectivityController';
import MywcomDeltaController from './MywcomDeltaController';
import MywcomCableController from './MywcomCableController';
import MywcomCircuitController from './MywcomCircuitController';
import MywcomConduitController from './MywcomConduitController';
import MywcomEquipmentController from './MywcomEquipmentController';
import MywcomLocController from './MywcomLocController';

import '../api/CommsNativeServerExtension';

// prettier-ignore
{
    // Feature services routed using commsNativeServerExtension
    // routing.register('modules/comms/feature',                                                                            MywcomFeatureController,       'runTransaction',   'POST')
    // routing.register('modules/comms/feature/{feature_type}',                                                             MywcomFeatureController,       'insertFeature',        'POST')
    // routing.register('modules/comms/feature/{feature_type}/{id}',                                                        MywcomFeatureController,       'updateFeature', 'PUT')
    // routing.register('modules/comms/feature/{feature_type}/{id}',                                                        MywcomFeatureController,       'deleteFeature', 'DELETE')

    routing.register('modules/comms/structure/{feature_type}/{id}/contents',                                             MywcomStructureController,     'struct_contents', 'GET');
    routing.register('modules/comms/route/{feature_type}/{id}/contents',                                                 MywcomStructureController,     'route_contents',  'GET');
    routing.register('modules/comms/route/{feature_type}/{id}/split',                                                    MywcomStructureController,     'route_split',     'POST');

    routing.register('modules/comms/conduit/{feature_type}/{id}/chain',                                                  MywcomConduitController,       'continuous_conduits', 'GET');
    routing.register('modules/comms/conduit/path',                                                                       MywcomConduitController,       'find_path',           'POST');
    routing.register('modules/comms/conduit/{feature_type}/route',                                                       MywcomConduitController,       'route',               'POST');
    routing.register('modules/comms/conduit/{cnd1_ft}/{cnd1_id}/connect/{cnd2_ft}/{cnd2_id}/at/{struct_ft}/{struct_id}', MywcomConduitController,       'connect',             'POST');
    routing.register('modules/comms/conduit/{conduit_ft}/{conduit_id}/disconnect_at/{struct_ft}/{struct_id}',            MywcomConduitController,       'disconnect',          'POST');
    routing.register('modules/comms/conduit/{feature_type}/{feature_id}/move_to/{housing_ft}/{housing_id}',              MywcomConduitController,       'move_into',           'POST');

    routing.register('modules/comms/equip/{equip_ft}/{equip_id}/move_to/{housing_ft}/{housing_id}',                      MywcomEquipmentController,     'move_assembly', 'POST');
    routing.register('modules/comms/equip/{equip_ft}/{equip_id}/copy_to/{housing_ft}/{housing_id}',                      MywcomEquipmentController,     'copy_assembly', 'POST');
    routing.register('modules/comms/equip/{feature_type}/{id}/cables',                                                   MywcomCableController,         'equip_cables',  'GET');

    routing.register('modules/comms/cable/path',                                                                         MywcomCableController,         'find_path',         'POST');
    routing.register('modules/comms/cable/{feature_type}/{id}/route',                                                    MywcomCableController,         'route_cable',       'POST');
    routing.register('modules/comms/cable/{feature_type}/{id}/reroute',                                                  MywcomCableController,         'reroute_cable',     'POST');
    routing.register('modules/comms/cable/{feature_type}/{id}/connections',                                              MywcomCableController,         'connections',       'GET');
    routing.register('modules/comms/cable/{feature_type}/{id}/highest_connected',                                        MywcomCableController,         'highest_connected', 'GET');
    routing.register('modules/comms/cable/{feature_type}/{feature_id}/split/{seg_id}/{cut_forward}',                     MywcomCableController,         'split_cable',       'POST');
    routing.register('modules/comms/cable/{feature_type}/{feature_id}/move_to/{housing_ft}/{housing_id}',                MywcomConduitController,       'move_cable_into',   'POST');

    routing.register('modules/comms/slack/{feature_type}/add',                                                           MywcomCableController,         'add_slack',         'POST');
    routing.register('modules/comms/slack/{feature_type}/split/{id}',                                                    MywcomCableController,         'split_slack',       'POST');

    routing.register('modules/comms/{tech}/connections/{feature_type}/{id}/{side}',                                      MywcomConnectivityController,  'connections', 'GET');
    routing.register('modules/comms/{tech}/paths/{feature_type}/{id}',                                                   MywcomConnectivityController,  'paths',       'GET');
    routing.register('modules/comms/{tech}/connect',                                                                     MywcomConnectivityController,  'connect',     'POST');
    routing.register('modules/comms/{tech}/disconnect',                                                                  MywcomConnectivityController,  'disconnect',  'POST');
    routing.register('modules/comms/{tech}/{feature_type}/{id}/circuits',                                                MywcomConnectivityController,  'circuits',    'GET');

    routing.register('modules/comms/circuit/{feature_type}/{id}/route',                                                  MywcomCircuitController,       'route_circuit',  'POST');
    routing.register('modules/comms/circuit/{feature_type}/{id}/unroute',                                                MywcomCircuitController,       'unroute_circuit','POST');

    routing.register('modules/comms/delta/{feature_type}/{id}/changes',                                                  MywcomDeltaController,         'changes',       'POST');
    routing.register('modules/comms/delta/{feature_type}/{id}/conflicts',                                                MywcomDeltaController,         'conflicts',     'GET');
    routing.register('modules/comms/delta/{feature_type}/{id}/validate',                                                 MywcomDeltaController,         'validate',      'GET');
    routing.register('modules/comms/delta/{feature_type}/{id}/bounds',                                                   MywcomDeltaController,         'bounds',        'GET');
    //ONLINE_ONLY routing.register('modules/comms/delta/{feature_type}/{id}/merge',                                      MywcomDeltaController,         'merge',         'POST')
    routing.register('modules/comms/delta/{delta_owner}/{delta_id}/revert/{feature_type}/{feature_id}',                  MywcomDeltaController,         'revert_feature','POST');
    //ONLINE ONLY routing.register('modules/comms/delta/{delta_owner}/{delta_id}/merge/{feature_type}/{feature_id}',     Mywcom_delta_controller,       'merge_feature', 'POST')
    routing.register('modules/comms/validate',                                                                           MywcomDeltaController,         'validate_area', 'GET');
    routing.register('modules/comms/structure/{feature_type}/{id}/replace/{new_feature_type}',                           MywcomStructureController,     'replace_structure', 'POST');
    //ONLINE_ONLY routing.register('modules/comms/config/validate',                                                      MywcomConfigController,        'validate',        'GET')
    //ONLINE_ONLY routing.register('modules/comms/config/validate/{aspect}',                                             MywcomConfigController,        'validate_aspect', 'GET')
    routing.register('modules/comms/loc/{feature_type}/{id}/ripple_trace',                                               MywcomLocController,           'ripple_trace',    'GET');
    routing.register('modules/comms/loc/{feature_type}/{id}/ripple_trace_update',                                        MywcomLocController,           'ripple_trace_update', 'POST');
    routing.register('modules/comms/loc/update',                                                                         MywcomLocController,           'update_loc',      'POST');
    routing.register('modules/comms/loc/get_details',                                                                    MywcomLocController,           'get_loc_details', 'POST');
    routing.register('modules/comms/loc/get',                                                                            MywcomLocController,           'get_loc',         'POST');
    routing.register('modules/comms/loc/{feature_type}/{id}/ripple_deletions',                                           MywcomLocController,           'ripple_deletions','POST');
    routing.register('modules/comms/loc/{feature_type}/{id}/disconnect_loc',                                             MywcomLocController,           'disconnect_loc',  'POST');
    routing.register('modules/comms/loc/{feature_type}/{id}/connect_loc',                                                MywcomLocController,           'connect_loc',     'POST');
}
