import myw from 'myWorld-client';
import 'main.standard';
import MyLineDrawer from './myLineDrawer';

import { CustomRulePlugin } from './CustomRule/customRulePlugin';

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const plugins = myw.applicationDefinition.plugins; //this is the application's list of plugins

plugins['customRulePlugin'] = CustomRulePlugin; //Adding the newly created plugin to the application's array

const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons; //This is the list of buttons in the application's top toolbar
desktopToolbarButtons.push('customRulePlugin.dialog'); //adding the plugin button defined as 'dialog' to the toolbar
