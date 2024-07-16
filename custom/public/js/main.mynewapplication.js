import myw from 'myWorld-client';
import 'main.standard';
import './api/commsDsApi';
import MyLineDrawer from './myLineDrawer';

import { CustomRulePlugin } from './CustomRule/customRulePlugin';
import { StructureCheckerPlugin } from './StructureChecker/structureCheckerPlugin';
import StructureManagerPlugin from './api/structureManagerPlugin';

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const plugins = myw.applicationDefinition.plugins; //this is the application's list of plugins

plugins['customRulePlugin'] = CustomRulePlugin; //Adding the newly created plugin to the application's array
plugins['structureCheckerPlugin'] = StructureCheckerPlugin;
// plugins['structureManager'] = StructureManagerPlugin;

const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons; //This is the list of buttons in the application's top toolbar
desktopToolbarButtons.push('customRulePlugin.dialog'); //adding the plugin button defined as 'dialog' to the toolbar
desktopToolbarButtons.push('structureCheckerPlugin.dialog'); //adding the plugin button defined as 'dialog' to the toolbar
