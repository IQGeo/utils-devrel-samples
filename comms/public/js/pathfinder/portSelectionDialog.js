import CircuitRoutingDialog from '../connectivity_ui/circuitRoutingDialog';

export default class PortSelectionDialog extends CircuitRoutingDialog {
    static {
        this.prototype.messageGroup = 'PathfinderModePlugin';
    }

    /**
     * Init slots of self
     */
    constructor(owner, struct, input, stateHandler) {
        super(owner, { title: '{:port_selection_title}' });
        this.owner = owner;
        this.struct = struct;

        this.app = owner.app;
        this.connectionManager = this.app.plugins.connectionManager;
        this.input = input;
        this.stateHandler = stateHandler;
    }

    /**
     * Subclassed to populate the 'from' input in the Path Finder modal
     * @override
     */
    async setPath() {
        const sel = this.treeView.selection();
        const fromQurn = this._getQUrn(sel);
        this.input.current.value = `${sel.feature.getTitle()} ${sel.pins.spec}`;
        this.stateHandler({ fromQurn });
        this.close();
    }

    /**
     * Returns a Qualified URN representation of selection i.e. 'shelf/1?pins=out:1:3'
     * @param {Object} selection treeView selection
     * @returns {String}
     */
    _getQUrn(selection) {
        const { feature, pins } = selection;
        return `${feature.getUrn()}?pins=${pins.spec}`;
    }
}
