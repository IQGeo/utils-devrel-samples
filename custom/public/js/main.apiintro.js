import myw from 'myWorld-client';
import '../../../comms_dev_db/public/js/main.mywcom_devdb';
import '../../../comms/public/js/api/commsDsApi';
import ApiPalettePlugin from './_DryRun/apiPalettePlugin';
import { ApiIntroPlugin } from './_apiIntro/apiIntroPlugin';
import { CustomerConnectionPlugin } from './_CustomerConnect/customerConnectionPlugin';

myw.localisation.loadModuleLocale('custom');

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons;
const plugins = myw.applicationDefinition.plugins; //this is the application's list of plugins
plugins['apiIntro'] = ApiIntroPlugin;
plugins['customerConnectionPlugin'] = CustomerConnectionPlugin;
plugins['apiPalette'] = [
    ApiPalettePlugin,
    {
        toolButtons: ['apiIntro.dialog', 'customerConnectionPlugin.dialog']
    }
];
desktopToolbarButtons.push('apiPalette.toggle');
