import myw from 'myWorld-client';
import '../../../comms_dev_db/public/js/main.mywcom_devdb';
import '../../../comms/public/js/api/commsDsApi';
import PalettePlugin from './PalettePlugin/palettePlugin';
import { CustomerConnectionPlugin } from '../Samples/customer_connection_javaScript/customer_connection_plugin';
import { PythonCustomerConnectionPlugin } from '../Samples/customer_connection_python/python_customer_connection_plugin';
import { LrtPlugin } from '../Samples/LRT/lrt_plugin';
import { BFTubeRenamePlugin } from '../Samples/bf_tube_rename/bf_tube_rename_plugin';

import fiberCountRule from '../Samples/design_rules/fiberCountRule';

myw.localisation.loadModuleLocale('utils-devrel-samples');

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons;
const plugins = myw.applicationDefinition.plugins;

plugins['customerConnectionPlugin'] = CustomerConnectionPlugin;
plugins['pythonCustomerConnectionPlugin'] = PythonCustomerConnectionPlugin;
plugins['lrtPlugin'] = LrtPlugin;
plugins['bfTubeRenamePlugin'] = BFTubeRenamePlugin;

plugins['designRulesManager'][1].rules.push(fiberCountRule);

plugins['palette'] = [
    PalettePlugin,
    {
        toolButtons: [
            'customerConnectionPlugin.dialog',
            'pythonCustomerConnectionPlugin.dialog',
            'lrtPlugin.dialog',
            'bfTubeRenamePlugin.dialog'
        ]
    }
];

desktopToolbarButtons.push('palette.toggle');
