import myw from 'myWorld-client';
// import 'main.standard';
import '../../../comms/public/js/main.mywcom';
import './api/commsDsApi';
import MyLineDrawer from './myLineDrawer';

import { CustomRulePlugin } from './CustomRule/customRulePlugin';
import { StructureCheckerPlugin } from './StructureChecker/structureCheckerPlugin';
import { EquipmentCheckerPlugin } from './EquipmentChecker/equipmentCheckerPlugin';
import { ConduitCheckerPlugin } from './ConduitChecker/conduitCheckerPlugin';
import { CableCheckerPlugin } from './CableChecker/cableCheckerPlugin';

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const plugins = myw.applicationDefinition.plugins; //this is the application's list of plugins

plugins['customRulePlugin'] = CustomRulePlugin; //Adding the newly created plugin to the application's array
plugins['structureCheckerPlugin'] = StructureCheckerPlugin;
plugins['equipmentCheckerPlugin'] = EquipmentCheckerPlugin;
plugins['conduitCheckerPlugin'] = ConduitCheckerPlugin;
plugins['cableCheckerPlugin'] = CableCheckerPlugin;

const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons; //This is the list of buttons in the application's top toolbar
desktopToolbarButtons.push('customRulePlugin.dialog');
desktopToolbarButtons.push('structureCheckerPlugin.dialog');
desktopToolbarButtons.push('equipmentCheckerPlugin.dialog');
desktopToolbarButtons.push('conduitCheckerPlugin.dialog');
desktopToolbarButtons.push('cableCheckerPlugin.dialog');
