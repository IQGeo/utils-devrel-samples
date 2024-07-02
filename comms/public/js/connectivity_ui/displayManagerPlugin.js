// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin } from 'myWorld-client';
import _ from 'underscore';
import CableStructureColorEngine from '../specs/cableStructureColorEngine';
import getFiberColor from './cableTree/fiberColor/getFiberColor';

export default class DisplayManagerPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'DisplayManagerPlugin';

        this.mergeOptions({
            showFiberColors: true, // Controls if fibers colors are included in tree labels
            showProposed: true // Controls if proposed objects are included in trees
        });
    }

    /**
     * @param  {Application}    owner   The application
     * @param  {Object}         options  Options for the plugin configuration
     * @fires  state-changed
     * @extends Plugin
     */
    constructor(owner, options) {
        super(owner, options);
        this.showFiberColors = this.options.showFiberColors;
        this.showProposed = this.options.showProposed;
        this.proposedObjectStyle = myw.config['mywcom.proposedObjectStyle'];
        this.showLoc = this.options.showLoc;
    }

    /**
     * State stored over application refreshes
     */
    getState() {
        return {
            showFiberColors: this.showFiberColors,
            showProposed: this.showProposed,
            showLoc: this.showLoc
        };
    }

    specManager() {
        return this.app.plugins['specManager'];
    }

    // ------------------------------------------------------------------------------
    //                                 PIN NODE TEXT
    // ------------------------------------------------------------------------------

    /**
     * Creates the 'from' part of a pin tree node label
     * Add the fiber color info where appropriate
     * @param   {MywFeature} feature  The cable to create the pin node for
     * @param   {integer}    pin      Pin for the node the text is being created for
     * @returns {string}
     */
    pinLabel(feature, pin) {
        const fiberColorHTML = feature ? this.getColorHTMLFor(feature, pin, 'from') : '';
        return `${fiberColorHTML} ${pin}`;
    }

    /**
     * Creates the 'connected to' part of a pin tree node label
     * Add the fiber color info where appropriate
     * @param   {integer}  pin    Pin for the node the text is being created for
     * @param   {Conn}   conn     Connection details
     * @returns {string}
     */
    connLabel(pin, conn, circuitCount) {
        if (conn.isProposed()) {
            return this._connLabelProposed(conn);
        }

        return this._connLabel(pin, conn);
    }

    /**
     * Returns 'connected to' part of a pin tree node label for proposed connection
     * @param {object} conn Connection object
     */
    _connLabelProposed(conn) {
        const connDir = conn.from_pins.side == 'out' ? '->' : '<-';

        let ftrStr = connDir + ' ';
        if (conn.to_cable) {
            ftrStr = conn.to_cable.getTypeExternalName();
        } else if (conn.to_feature) {
            ftrStr = conn.to_feature.getTypeExternalName();
        } else {
            ftrStr = '';
        }
        const deltaDesc = conn.deltaTitle;

        const label = ` ${connDir} ${ftrStr}`;
        return this._proposedText(label, deltaDesc);
    }

    /**
     * Creates 'connected to' part of a pin tree node label for features in master
     * @param {integer} pin
     * @param {Conn} conn
     */
    _connLabel(pin, conn) {
        const toPin = conn.toPinFor(pin);

        // Build direction indicator
        const connDir = conn.from_pins.side == 'out' ? '->' : '<-';

        // Build feature ident
        let ftrStr;
        if (conn.to_cable) {
            ftrStr = conn.to_cable.properties.name;
        } else if (conn.to_feature) {
            ftrStr = conn.to_feature.properties.name;
        } else {
            ftrStr = '';
        }

        // Build pin ident
        let pinStr;
        if (conn.to_cable) {
            if (conn.to_cable.properties.directed) {
                pinStr = '' + toPin;
            } else {
                pinStr = this.msg('cable_pin_' + conn.to_pins.side) + ':' + toPin;
            }
            pinStr += this.getColorHTMLFor(conn.to_cable, toPin, 'to');
        } else {
            pinStr = this.msg('side_' + conn.to_pins.side) + ':' + toPin;
        }

        return ` ${connDir} ${ftrStr} #${pinStr}`;
    }

    /**
     * String showing circuit count
     */
    circuitCount(circuitCount, allProposed) {
        let countStr = this.msg('circuit_count', { count: circuitCount });

        if (allProposed) {
            return this._proposedText(countStr);
        }

        return countStr;
    }

    /**
     * String to display for 'feature' in an equipment or cable tree
     */
    featureLabel(feature, side = null) {
        if (feature.isProposed()) {
            let nodeText = feature.getTypeExternalName();
            if (side) nodeText += ` - ${side}`;
            return this._proposedText(nodeText, feature.getDeltaDescription());
        }

        return feature.getTitle();
    }

    /**
     * Label for a splice node in an equipment tree
     * @param {Object} splice
     */
    spliceLabel(splice) {
        // Get count
        // ENH: Get from splice .. taking duplicate conns into account?
        let count = 0;
        for (const conn of splice.conns) {
            count += conn.from_pins.size;
        }

        // Build label
        const from = splice.from_cable.properties.name;
        const to = splice.to_cable.properties.name;
        const text = `${this.msg('splice')}: ${from} -> ${to} (${count})`;

        if (splice.proposed) {
            return this._proposedText(text, splice.deltaTitle);
        }

        return text;
    }

    /**
     * Label for a cable node in a conduit cable tree
     * @param {MywFeature} cable
     */
    cableLabel(cable, seg, side, pins, n_connected) {
        let sideStr;
        if (cable.properties.directed) {
            sideStr = this.msg('side_' + side);
        } else {
            sideStr = this.msg('cable_' + side);
        }

        if (seg.isProposed()) {
            return this.featureLabel(cable, sideStr);
        }

        return `${cable.properties.name} : ${sideStr} (${n_connected}/${pins.size})`;
    }

    /**
     * Label for undirected cable in cablePinTreeView
     * @param {MywFeature} cable
     */
    unDirectedCableLabel(cable) {
        if (cable.isProposed()) {
            return this.featureLabel(cable);
        }
        const pin_count = cable.pinCount();

        return `${cable.properties.name} (${pin_count})`;
    }

    // Extra infor for 'side' of cable segment 'seg'
    segDecorations(seg, side, equips) {
        let str = '';

        // Add tick mark information
        const tickField = side + '_tick';
        const tickMark = seg.properties[tickField];
        if (tickMark || tickMark == 0) {
            str += ` @${tickMark}`;
        }

        // Add explicit containment
        const equipField = side + '_equipment';
        const equipUrn = seg.properties[equipField];
        if (equipUrn) {
            const equip = equips[equipUrn];
            const equipName = equip ? equip.getTitle() : equipUrn;
            str += ' [' + equipName + ']';
        }

        return str;
    }

    /**
     * Label for a passthrough conduit in a cable tree
     * @param {MywFeature} conduit
     */
    // ENH: Handle non-connected here too
    connectedConduitLabel(conduit, nextConduit) {
        if (conduit.isProposed()) {
            const text = this.msg('proposed_pass_through_conduit');
            return this._proposedText(text, conduit.getDeltaDescription());
        } else {
            return `${conduit.getTitle()} == ${nextConduit.getTitle()}`;
        }
    }

    /**
     * Label for a circuit node in a cable or equipment tree
     */
    circuitLabel(circuitInfo, proposed) {
        if (proposed) {
            const text = this.msg('proposed_circuit'); // ENH: Use feature type instead?
            return this._proposedText(text, circuitInfo.delta.title);
        }

        return circuitInfo.name;
    }

    /**
     * Builds a label styled for a proposed object
     */
    _proposedText(text, deltaDesc = null) {
        const color = this.proposedObjectStyle.color;

        let html = `<span style="color:${color};"> ${text} </span>`;

        if (deltaDesc) {
            html += `<span class="design-link" style="color:${color};" > [${deltaDesc}] </span>`;
        }

        return html;
    }

    // ------------------------------------------------------------------------------
    //                                PIN COLOR
    // ------------------------------------------------------------------------------

    /*
     * HTML string for color of fiber 'pin' in 'cable'
     * Returns empty string if cable spec has no color info or color display not enabled
     * @param  {MywFeature} cable
     * @param  {integer} pin
     * @param  {string}  [direction='from']  'from'/'to'
     * @returns {string}
     */
    getColorHTMLFor(cable, pin, direction) {
        if (!this.showFiberColors) return '';

        const fiberColor = this.getFiberColorFor(cable, pin);
        if (!fiberColor) return '';

        const colorHTML = getFiberColor(fiberColor);

        return `<div class="fiber-colors ${direction}">${colorHTML}</div>`;
    }

    /**
     * The FiberColor for fiber 'pin' of 'cable' (if known)
     * @param  {MywFeature} cable
     * @return {FiberColor|null} A fiber color definition (see FiberColorEngine)
     */
    getFiberColorFor(cable, pin) {
        const fiberColors = this.getFiberColorsFor(cable);
        if (!fiberColors) return null;

        return fiberColors[pin];
    }

    /**
     * Get fiber color infos for 'cable' (caching to minimise server calls)
     * @param  {MywFeature} cable
     * @return {object|null} mapping from pin to FiberColor (see FiberColorEngine)
     */
    getFiberColorsFor(feature) {
        const spec = this.specManager().getSpecFor(feature);

        if (!spec) return null;

        // Used cached colors if possible
        if (!_.isUndefined(spec.cached_fiber_colors)) return spec.cached_fiber_colors;

        // No cached colors, instantiate engine to generate them
        let cableStructure = JSON.parse(spec.properties.cable_structure);

        let colors = new CableStructureColorEngine().getColors(cableStructure);

        // Cache for the next time
        spec.cached_fiber_colors = colors;

        return colors;
    }

    /**
     * Gets string for displaying cable structure info from JSON cableStructure
     * @param {Object} cableStructure
     * @returns {String} String representing structure
     */
    getCableStructureString(cableStructure) {
        if (!cableStructure) return '';
        return cableStructure
            .map(x => {
                let type = x.bundleType || 'fibers';
                return `${x.bundleSize} ${myw.msg('SimpleBundleDialog', type)}`;
            })
            .join(' x ');
    }

    /**
     * Add to 'optionsMenu' a button for toggling self's showFiberColors property
     */
    addFiberColorButton(optionMenu) {
        optionMenu.addButton(
            this.msg('show_fiber_colors'),
            btn => {
                this.toggleFiberColors();
            },
            btn => {
                return this.showFiberColors;
            }
        );
    }

    /**
     * Add to 'optionsMenu' a button for toggling self's showProposed property
     */
    addShowProposedButton(optionMenu) {
        optionMenu.addButton(
            this.msg('show_proposed'),
            btn => {
                this.toggleProposed();
            },
            btn => {
                return this.showProposed;
            }
        );
    }

    toggleFiberColors() {
        this.showFiberColors = !this.showFiberColors;
        this.trigger('state-changed', this.app.currentFeature); // TODO: Remove current feature
    }

    toggleProposed() {
        this.showProposed = !this.showProposed;
        this.trigger('state-changed', this.app.currentFeature);
    }

    /**
     * Add show-loc button to option menu
     *
     * @param {*} optionMenu
     */
    addLocButton(optionMenu) {
        optionMenu.addButton(
            this.msg('show_loc'),
            btn => {
                this.toggleLoc();
            },
            btn => {
                return this.showLoc;
            }
        );
    }

    /**
     * Toggle display of line of count information
     */
    toggleLoc() {
        this.showLoc = !this.showLoc;
        this.trigger('state-changed', this.app.currentFeature);
    }

    pinTextFor(feature, pin, side) {
        if (feature.definedFunction() == 'bridge_tap' && side == 'out') {
            const size = feature.properties.n_copper_in_ports;
            if (pin <= feature.properties.n_copper_in_ports) {
                return `A${pin}`;
            } else {
                return `B${pin - size}`;
            }
        } else {
            return pin;
        }
    }
}
