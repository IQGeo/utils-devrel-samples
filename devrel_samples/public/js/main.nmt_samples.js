import myw from 'myWorld-client';
import '../../../comms/public/js/main.mywcom';
import '../../../comms/public/js/api/commsDsApi';
import PalettePlugin from './PalettePlugin/palettePlugin';
import { CustomerConnectionPlugin } from '../Samples/customer_connection_javaScript/customer_connection_plugin';
import { PythonCustomerConnectionPlugin } from '../Samples/customer_connection_python/python_customer_connection_plugin';
import { LrtPlugin } from '../Samples/LRT/lrt_plugin';

myw.localisation.loadModuleLocale('devrel_samples');

const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons;
const plugins = myw.applicationDefinition.plugins;

// function removeButtonFromToolbar(buttonName) {
//     const index = desktopToolbarButtons.indexOf(buttonName);
//     if (index > -1) {
//         desktopToolbarButtons.splice(index, 1);
//     }
// }

// function removeCommsButtons() {
//     delete plugins['print'];
//     delete plugins['trace'];
//     delete plugins['schematics'];
//     delete plugins['toolsMode'];
//     delete plugins['structureMode'];
//     delete plugins['equipmentMode'];
//     delete plugins['markupMode'];

//     removeButtonFromToolbar('print.dialog');
//     removeButtonFromToolbar('trace.dialog');
//     removeButtonFromToolbar('schematics.toggleView');
//     removeButtonFromToolbar('toolsMode.toggle');
//     removeButtonFromToolbar('structureMode.toggle');
//     removeButtonFromToolbar('equipmentMode.toggle');
//     removeButtonFromToolbar('markupMode.toggle');
// }

// removeCommsButtons();

plugins['customerConnectionPlugin'] = CustomerConnectionPlugin;
plugins['pythonCustomerConnectionPlugin'] = PythonCustomerConnectionPlugin;
plugins['lrtPlugin'] = LrtPlugin;
plugins['palette'] = [
    PalettePlugin,
    {
        toolButtons: [
            'customerConnectionPlugin.dialog',
            'pythonCustomerConnectionPlugin.dialog',
            'lrtPlugin.dialog'
        ]
    }
];

desktopToolbarButtons.push('palette.toggle');
