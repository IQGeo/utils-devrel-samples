import myw from 'myWorld-client';

import 'modules/workflow_manager/js/main.wfm';

import { FieldValidatorPlugin } from '../Samples/WFM_NMT_integration/fieldValidatorPlugin';
import { MilestoneMapPlugin } from '../Samples/WFM_NMT_map_widget/milestoneMapPlugin';

myw.localisation.loadModuleLocale('utils_devrel_samples');

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const plugins = myw.applicationDefinition.plugins; //this is the application's list of plugins

plugins['fieldValidatorPlugin'] = FieldValidatorPlugin; //Adding the newly created plugin to the application's array
plugins['milestoneMapPlugin'] = MilestoneMapPlugin;

const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons; //This is the list of buttons in the application's top toolbar
desktopToolbarButtons.push('fieldValidatorPlugin.dialog');
desktopToolbarButtons.push('milestoneMapPlugin.dialog');
