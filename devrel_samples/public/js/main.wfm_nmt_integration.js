import myw from 'myWorld-client';
import '../../../workflow_manager_dev_db/public/js/main.nmt-wfm-dev';

import { FieldValidatorPlugin } from '../Samples/WFM_NMT_integration/fieldValidatorPlugin';

myw.localisation.loadModuleLocale('devrel_samples');

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const plugins = myw.applicationDefinition.plugins; //this is the application's list of plugins

plugins['fieldValidatorPlugin'] = FieldValidatorPlugin; //Adding the newly created plugin to the application's array
plugins['toolsMode'][1].toolButtons.push('fieldValidatorPlugin.dialog');

const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons; //This is the list of buttons in the application's top toolbar
desktopToolbarButtons.push('fieldValidatorPlugin.dialog');
