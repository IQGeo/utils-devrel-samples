import myw from 'myWorld-client';
import 'modules/comms_dev_db/js/main.mywcom_devdb';
import 'modules/comms/js/api/commsDsApi';
import PalettePlugin from './PalettePlugin/palettePlugin';
import { CustomerConnectionPlugin } from '../Samples/customer_connection_javaScript/customer_connection_plugin';
import { PythonCustomerConnectionPlugin } from '../Samples/customer_connection_python/python_customer_connection_plugin';
import { LrtPlugin } from '../Samples/LRT/lrt_plugin';
import { BFTubeRenamePlugin } from '../Samples/bf_tube_rename/bf_tube_rename_plugin';
import { LiveDocsPlugin } from '../Samples/live_docs/liveDocs_plugin';
import { ConduitCapacityPlugin } from '../Samples/conduit_capacity/conduit_capacity_plugin';

import fiberCountRule from '../Samples/design_rules/fiberCountRule';

import { MyFeatureLabel } from '../Samples/custom_layer/MyFeatureLabel';
import NewConduit from '../../../custom/public/js/newConduit';

myw.localisation.loadModuleLocale('utils-devrel-samples');
myw.MyFeatureLabel = MyFeatureLabel;

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons;
const plugins = myw.applicationDefinition.plugins;

plugins['customerConnectionPlugin'] = CustomerConnectionPlugin;
plugins['pythonCustomerConnectionPlugin'] = PythonCustomerConnectionPlugin;
plugins['lrtPlugin'] = LrtPlugin;
plugins['bfTubeRenamePlugin'] = BFTubeRenamePlugin;
plugins['liveDocsPlugin'] = LiveDocsPlugin;
plugins['conduitCapacityPlugin'] = ConduitCapacityPlugin;

plugins['designRulesManager'][1].rules.push(fiberCountRule);

plugins['palette'] = [
    PalettePlugin,
    {
        toolButtons: [
            'customerConnectionPlugin.dialog',
            'pythonCustomerConnectionPlugin.dialog',
            'lrtPlugin.dialog',
            'bfTubeRenamePlugin.dialog',
            'liveDocsPlugin.dialog',
            'conduitCapacityPlugin.dialog'
        ]
    }
];

desktopToolbarButtons.push('palette.toggle');
