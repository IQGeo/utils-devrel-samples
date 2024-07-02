import myw, { PluginButton } from 'myWorld-client';
import showObjectsImg from '../images/caret.svg';
// import ShowObjectsPlugin from './showObjects/showObjectsPlugin';
import ShowObjectsRESTPlugin from './ShowObjectsREST/ShowObjectsRESTPlugin.js';

class ShowObjectsREST extends myw.Plugin {
    static {
        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.titleMsg = 'newtab_msg';
                    this.prototype.imgSrc = showObjectsImg;
                }

                action() {
                    this.owner.GetObjects();
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);
        this.showObjectsRESTPlugin = new ShowObjectsRESTPlugin(owner, options);
    }

    GetObjects() {
        // console.log(ShowObjectsPlugin);
        this.showObjectsRESTPlugin.getObjectsFromRESTAPI();
    }
}

export default ShowObjectsREST;
