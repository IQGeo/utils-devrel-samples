// Copyright: Ubisense Limited 2010-2023
import myw from 'myWorld-client';

// Interactive tool for laying out aerial routes and poles
class StrandLayoutPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'StrandLayoutPlugin';
    }

    // Init slots
    constructor(owner, options) {
        super(owner, options);
        this.onlyEdit = true;

        this.options['config'] = {
            enabled: false, //Set disabled if no settings are found.
            ...myw.config['mywcom.strandLayout']
        };

        this.app.ready.then(() => {
            this.datasource = this.app.getDatasource('myworld');
        });
    }

    /**
     * Open data validation dialog
     */
    async showDialog() {
        this.app.fire('toggleStrandLayout', {
            visible: true
        });
    }
}

StrandLayoutPlugin.prototype.buttons = {
    dialog: class extends myw.PluginButton {
        static {
            this.prototype.titleMsg = 'toolbar_msg';
            this.prototype.imgSrc = 'modules/comms/images/toolbar/strand_layout.svg';
        }

        async action() {
            this.owner.showDialog();
        }

        async hasPermission() {
            const enabled = this.owner.options.config.enabled;
            const hasRights =
                (await this.owner.app.userHasPermission('mywcom.editMaster')) ||
                this.owner.datasource.getDelta();

            return enabled && hasRights;
        }
    }
};

export default StrandLayoutPlugin;
