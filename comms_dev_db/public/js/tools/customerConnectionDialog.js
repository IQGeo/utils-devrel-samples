// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Dialog, Input, Form, GeoJSONVectorLayer, DisplayMessage, LineStyle } from 'myWorld-client';
import CustomerConnectionBuilder from './customerConnectionBuilder';
import { Stroke, Style } from 'ol/style';

/**
 * Interative tool for building overhead customer connections
 */
class CustomerConnectionDialog extends Dialog {
    static {
        this.prototype.messageGroup = 'CustomerConnectionDialog';
    }

    constructor(owner, equipProps) {
        // Build GUI
        //const { msg } = myw.hooks.useLocale('CustomerConnectionDialog');

        super({
            modal: false,
            autoOpen: false,
            title: equipProps.title
        });

        this.options.beforeClose = () => this.beforeClose();
        const buttons = {
            create: {
                text: this.msg('create'),
                class: 'primary-btn create-btn',
                disabled: true,
                click: () => this.buildConnection()
            },
            close: {
                text: this.msg('close_btn'),
                class: 'right',
                click: () => this.close()
            }
        };

        this.setButtons(buttons);

        // Init slots
        this.app = owner.app;
        this.builder = new CustomerConnectionBuilder(this.app.database);
        this.dialogProps = equipProps;

        this.struct = null;
        this.customer = null;

        //setup Open Layers vector layer for line og route
        // this.previewStyle = new Style({
        //     stroke: new Stroke({
        //         color: 'rgb(0,0,255)',
        //         width: 1
        //     })
        // });

        this.previewStyle = new LineStyle({ color: '#0000FF', opacity: 0.75, weight: 2 });
        this.previewOverlay = new GeoJSONVectorLayer({
            map: this.app.map
        });

        this.render();
        this.addItems();
    }

    // Add data items to self
    addItems() {
        this.structNameItem = new Input({ cssClass: 'medium', disabled: true });
        this.customerNameItem = new Input({ cssClass: 'medium', disabled: true });
        this.wallBoxNameItem = new Input({
            cssClass: 'medium',
            onChange: this.updateGUI.bind(this)
        });
        this.dropCableNameItem = new Input({
            cssClass: 'medium',
            onChange: this.updateGUI.bind(this)
        });
        this.dropCableCountItem = new Input({
            cssClass: 'medium',
            onChange: this.updateGUI.bind(this)
        });
        this.feederFiberItem = new Input({
            cssClass: 'medium',
            onChange: this.updateGUI.bind(this)
        });

        this.form = new Form({
            messageGroup: 'CustomerConnectionDialog',
            rows: [
                { label: '{:pole}:', components: [this.structNameItem] },
                { label: '{:customer}:', components: [this.customerNameItem] },
                { label: '{:wall_box_name}:', components: [this.wallBoxNameItem] },
                { label: '{:drop_cable_name}:', components: [this.dropCableNameItem] },
                { label: 'Feeder Fiber', components: [this.feederFiberItem] }
            ]
        });

        this.$el.html(this.form.$el);

        // Add message display area
        // TODO: Find a better way?
        this.$el.append($('<div>', { class: 'message-container' }));
    }

    // Open and start listening for events
    // ENH: Find a way to use afterOpen event
    open() {
        this.setEquipProps(this.dialogProps);
        this.active = true;
        super.open();
        this.updateTarget();
        this.app.on('currentFeature-changed currentFeatureSet-changed', this.updateTarget, this);
    }

    // Stop listening for events
    beforeClose() {
        this.app.off('currentFeature-changed currentFeatureSet-changed', this.updateTarget, this);
        this.previewOverlay.clear();
        this.active = false;
    }

    // Update self for change in currently selected object
    async updateTarget() {
        const feature = this.app.currentFeature;

        if (!feature) return;

        if (feature.getType() === 'pole') {
            this.struct = feature;
            this.updateGUI();
        }

        if (feature.getType() === 'address') {
            this.customer = feature;
            this.updateGUI();
        }
    }

    // Update items from current state
    async updateGUI() {
        this.structNameItem.setValue(this.struct ? this.struct._myw.title : '');
        this.customerNameItem.setValue(this.customer ? this.customer._myw.title : '');

        this.canCreate = !!(this.struct && this.customer);
        const createMsg = this.msg('create');
        this.$el
            .dialog('widget')
            .find(`button:contains('${createMsg}')`)
            .button(this.canCreate ? 'enable' : 'disable');

        this.updateLeaderLine();
    }

    // Show or hide the leader line
    updateLeaderLine() {
        this.previewOverlay.clear();

        const lngLats = [];
        if (this.struct && this.customer) {
            lngLats.push([
                this.struct.geometry.coordinates[0],
                this.struct.geometry.coordinates[1]
            ]); // ENH: Provide helper
            lngLats.push([
                this.customer.geometry.coordinates[0],
                this.customer.geometry.coordinates[1]
            ]); // ENH: Provide helper
            this.previewOverlay.addLine(lngLats, this.previewStyle);
        }
    }

    showMessage(message, type) {
        new DisplayMessage({ el: this.$('.message-container'), type: type, message: message });
    }

    // --------------------------------------------------------------------------------
    //                                CONNECTION BUILDING
    // --------------------------------------------------------------------------------

    // Set equipment properties from dict 'props' (as returned from self.equipProps())
    async setEquipProps(props) {
        const mapCenter = this.app.map.getCenter();
        const features = await this.app.database.getFeaturesAround(['service_area'], mapCenter, 0);

        let serviceAreaId = '';
        // If not in a service area, default prefix of XX
        if (features.length === 0) {
            serviceAreaId = 'XX';
        } else {
            serviceAreaId = features[0].id;
        }

        this.wallBoxNameItem.setValue(`${serviceAreaId}-6000`);
        this.dropCableNameItem.setValue(`DROP-6000`);
        this.dropCableCountItem.setValue(props.dropCableCount || 4),
            this.feederFiberItem.setValue(props.feederFiber || 1);
    }

    // Equipment properties
    equipProps() {
        return {
            wallBoxName: this.wallBoxNameItem.getValue(),
            dropCableName: this.dropCableNameItem.getValue(),
            dropCableCount: this.dropCableCountItem.getValue(),
            feederFiber: this.feederFiberItem.getValue()
        };
    }

    // Build connection for currently selected objects (handling errors)
    async buildConnection() {
        this._buildConnection().catch(error => {
            this.showMessage('Error: ' + error, 'error');
        });
    }

    // Build connection for currently selected objects
    async _buildConnection() {
        if (!this.canCreate) {
            this.showMessage('Select pole and address', 'error');
            return;
        }
        const equipProps = {
            wallBox: { name: this.wallBoxNameItem.getValue() },
            dropCable: {
                name: this.dropCableNameItem.getValue(),
                fiber_count: this.dropCableCountItem.getValue(),
                directed: true
            }
        };

        // Find splitter
        const splitters = await this.builder.findSplitters(this.struct);
        let connPoint = await this.builder.findConnectionPoint(splitters);
        if (!connPoint) {
            const feederFiber = parseInt(this.feederFiberItem.getValue());
            connPoint = await this.builder.buildSplitter(
                this.struct,
                feederFiber,
                splitters.length + 1
            );
            this.feederFiberItem.setValue(feederFiber + 1);
        }

        // Create connection
        await this.builder.buildConnection(
            this.struct,
            this.customer.geometry.coordinates,
            equipProps,
            connPoint
        );

        // Say what we did
        const connStr =
            (connPoint.splitter.properties.name || '<unnamed>') + ' OUT#' + connPoint.port;
        this.showMessage('Connected to splitter port ' + connStr, 'success');

        // Show something useful in feature editor (so user can trace)
        this.app.setCurrentFeature(connPoint.splitter);

        // Update names
        this.incrementNames();

        // Clear the current customer
        this.customer = null;
        this.updateGUI();
    }

    // Update equipment names to next value in sequence
    incrementNames() {
        this.wallBoxNameItem.setValue(this.builder.nextName(this.wallBoxNameItem.getValue()));
        this.dropCableNameItem.setValue(this.builder.nextName(this.dropCableNameItem.getValue()));
    }
}

export default CustomerConnectionDialog;
