import myw from 'myWorld-client';
// import 'main.standard';
import '../../../comms_dev_db/public/js/main.mywcom_devdb';
import './api/commsDsApi';
import MyLineDrawer from './myLineDrawer';

import { CustomRulePlugin } from './CustomRule/customRulePlugin';
import { StructureCheckerPlugin } from './StructureChecker/structureCheckerPlugin';
import { EquipmentCheckerPlugin } from './EquipmentChecker/equipmentCheckerPlugin';
import { ConduitCheckerPlugin } from './ConduitChecker/conduitCheckerPlugin';
import { CableCheckerPlugin } from './CableChecker/cableCheckerPlugin';
import { ConnectionCheckerPlugin } from './ConnectionChecker/connectionCheckerPlugin';
import { CustomerConnectionPlugin } from './CustomerConnection/customerConnectionPlugin';
import APIPalettePlugin from './modes/apiPalettePlugin';

myw.localisation.loadModuleLocale('custom');

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const plugins = myw.applicationDefinition.plugins; //this is the application's list of plugins

plugins['customRulePlugin'] = CustomRulePlugin; //Adding the newly created plugin to the application's array
plugins['structureCheckerPlugin'] = StructureCheckerPlugin;
plugins['equipmentCheckerPlugin'] = EquipmentCheckerPlugin;
plugins['conduitCheckerPlugin'] = ConduitCheckerPlugin;
plugins['cableCheckerPlugin'] = CableCheckerPlugin;
plugins['connectionCheckerPlugin'] = ConnectionCheckerPlugin;
plugins['customerConnectionPlugin'] = CustomerConnectionPlugin;
plugins['apiPalette'] = [
    APIPalettePlugin,
    {
        toolButtons: [
            'structureCheckerPlugin.dialog',
            'equipmentCheckerPlugin.dialog',
            'conduitCheckerPlugin.dialog',
            'cableCheckerPlugin.dialog',
            'connectionCheckerPlugin.dialog',
            'customerConnectionPlugin.dialog'
        ]
    }
];

const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons; //This is the list of buttons in the application's top toolbar
desktopToolbarButtons.push('customRulePlugin.dialog');
desktopToolbarButtons.push('apiPalette.toggle');
