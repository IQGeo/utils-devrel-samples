// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';
import { strCmp } from '../base/strUtils';

export default class EquipmentReport extends Report {
    static {
        /**
         * @class Report detailing the equipment within a structure
         */
        this.prototype.messageGroup = 'EquipmentReport';

        // Customisation hooks
        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, feature) {
        for (const category of ['structures', 'equipment']) {
            const config = app.system.settings['mywcom.' + category];
            if (feature.getType() in config) return true;
        }

        return false;
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     */
    constructor(app, housing) {
        super(app, housing);
        this.app = app;
        this.housing = housing;
        this.structManager = app.plugins.structureManager;
        this.deltaOwner = null;

        this.featureFields = myw.config['mywcom.equipmentReport'].featureFields;
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        return `${this.typeName()}: ${this.housing.getTitle()}`;
    }

    /**
     * String used to identify self in choice lists etc
     */
    typeName() {
        return this.msg('type');
    }

    // ------------------------------------------------------------------------
    //                               DATA GATHERING
    // ------------------------------------------------------------------------

    /**
     * Get information for report body
     */
    // ENH: Move to server? Or use containment service?
    async build() {
        this.date = new Date();

        if (this.housing.properties.root_housing) {
            this.struct = await this.housing.followReference('root_housing'); // ENH: Handle missing?
        } else {
            this.struct = this.housing;
        }

        // Get equipment
        const structContent = await this.structManager.structContent(this.struct);
        const structTree = structContent.equipTree();
        this.equipTree = structTree.subtreeFor(this.housing.getUrn());

        // Load images for table
        this.iconsByType = {};
        const equips = myw.config['mywcom.equipment'];
        for (const equipInfo of Object.keys(equips)) {
            const path = this.getIconFor(equipInfo);
            const image = await this._loadImage(path);
            this.iconsByType[equipInfo] = image;
        }

        this.maxDepth = this.maxDepthOf([this.equipTree]);

        if (this.app.getDelta()) {
            this.deltaOwner = await this.app
                .getDatasource('myworld')
                .getFeatureByUrn(this.app.getDelta());
        }
    }

    // ------------------------------------------------------------------------
    //                                GENERATION
    // ------------------------------------------------------------------------

    /**
     * Write report on ReportStream 'strm'
     */
    generate(strm) {
        this.writeHeader(strm);
        this.writeBody(strm);
        return strm.doc;
    }

    /**
     * Output header info
     */
    writeHeader(strm) {
        // Show report type
        strm.writeHeading(3, this.typeName());

        // Show object being reported on
        strm.writeHeading(1, this.housing.getTitle());

        // Show containing structure (if necessary)
        if (this.struct != this.housing) {
            strm.writeLine(this.struct.getTitle());
        }

        // Add design info (if appropriate)
        if (this.deltaOwner) {
            strm.writeLine(this.deltaOwner.getTitle());
        }

        // Add generation date
        strm.writeLine(this.msg('date'), ': ', this.date.toLocaleDateString());

        // ENH: Show location map and connectivity schematic
        strm.writeLine();
    }

    /**
     * Output content as a table
     * Adds columns for featureFields
     */
    writeBody(strm) {
        const columns = [];
        for (let i = 0; i < this.maxDepth; i++) {
            columns.push(`icon_${i}`);
        }
        const cols = ['type', 'name'];
        columns.push(...cols);
        columns.push(...this.featureFields);

        //Add port cols after feature fields
        const portCols = ['in_connected', 'out_connected'];
        columns.push(...portCols);

        //Set unchanging col headings
        const staticColHeadings = {
            icon_1: this.msg('feature_type'),
            name: this.msg('name'),
            in_connected: this.msg('in_ports'),
            out_connected: this.msg('out_ports')
        };

        //Build table
        const tab = new ReportTable(columns);
        const colStyles = {
            icon_1: { hAlign: 'right' },
            in_connected: { hAlign: 'right' },
            out_connected: { hAlign: 'right' }
        };
        const {
            tab: tab1,
            colStyles: colStyles1,
            colHeadings
        } = this.buildTable(tab, colStyles, staticColHeadings, this.equipTree, 0);

        const options = {
            colHeadings,
            colStyles: colStyles1,
            skipEmptyCols: true,
            style: this.tableStyle
        };
        strm.writeTable(tab1, options);
    }

    /**
     * Build table, centering icons and scaling images (recursive)
     */
    buildTable(tab, colStyles, colHeadings, tree, depth) {
        depth += 1;

        const children = tree.children.sort(this.sortProc);
        for (const child of children) {
            const equip = child.feature;
            tab.nextRow();
            tab.add(`icon_${depth}`, {
                value: this.iconsByType[equip.getType()],
                scale: 1.4
            });
            tab.add('type', equip.featureDD.external_name);
            tab.add('name', equip.properties.name);

            if (depth !== 1)
                colStyles[`icon_${depth}`] = { hAlign: 'center', rightPad: 0, leftPad: 0 };

            //Add feature fields if they exist on equip
            for (const fieldName of this.featureFields) {
                if (!(fieldName in equip.featureDD.fields)) continue;

                const field = equip.getFieldDD(fieldName);

                //Set table header to first feature with 'fieldName'
                if (!colHeadings[fieldName]) colHeadings[fieldName] = field.external_name;

                tab.add(fieldName, equip.properties[fieldName]);
            }

            //Build pin information in and out connected/total
            if (Object.keys(child.pins).length) {
                if (child.pins.in_pins)
                    tab.add(
                        'in_connected',
                        `${child.pins.in_pins.n_connected}/${child.pins.in_pins.pins.high}`
                    );

                if (child.pins.out_pins)
                    tab.add(
                        'out_connected',
                        `${child.pins.out_pins.n_connected}/${child.pins.out_pins.pins.high}`
                    );
            }

            this.buildTable(tab, colStyles, colHeadings, child, depth);
        }

        return { tab, colStyles, colHeadings };
    }

    // -----------------------------------------------------------------------------
    //                              HELPERS
    // -----------------------------------------------------------------------------

    getIconFor(featureType) {
        const equipConfig = myw.config['mywcom.equipment'][featureType] || {};

        return equipConfig.image || 'modules/comms/images/features/default.svg';
    }

    /**
     * Depth of deepest pin tree in 'equipTrees' (recursive)
     */
    maxDepthOf(equipTrees) {
        let maxDepth = 0;
        for (const pinTree of equipTrees) {
            maxDepth = Math.max(maxDepth, 1 + this.maxDepthOf(pinTree.children));
        }

        return maxDepth;
    }

    /**
     * Get image as HtmlImageElement
     */
    async _loadImage(path) {
        const img = new Image();
        img.src = myw.baseUrl + path;
        const promise = new Promise(resolve => {
            img.onload = function () {
                resolve(this);
            };
        });

        return promise;
    }

    /**
     * Helper for ordering equipTrees
     *
     * Returns -1 if 'equipTree1' should come first
     */
    sortProc(equipTree1, equipTree2) {
        // Sort by type first
        if (equipTree1.feature.getType() != equipTree2.feature.getType()) {
            return equipTree1.feature.getType().localeCompare(equipTree2.feature.getType());
        }

        // Then sort by feature name
        return strCmp(equipTree1.feature.properties.name, equipTree2.feature.properties.name); // ENH: Faster to split once using strParts()
    }
}
