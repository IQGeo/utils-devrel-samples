// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';
import { strCmp } from '../base/strUtils';
import CableManagerPlugin from '../api/cableManagerPlugin';

export default class BOMReport extends Report {
    static {
        /**
         * @class Report detailing the cost of building a design
         */
        this.prototype.messageGroup = 'BOMReport';

        // Customisation hooks
        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, feature) {
        return false;
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     *
     * Init slots of self
     * @param {Application} app
     * @param {Array<MywFeature>} features
     */
    constructor(app, features) {
        super(app, features);
        this.app = app;
        this.features = features;

        this.categories = ['structures', 'equipment', 'routes', 'conduits', 'cables']; // Defines table order

        this.structsConfig = myw.config['mywcom.structures'];
        this.routesConfig = myw.config['mywcom.routes'];
        this.equipConfig = myw.config['mywcom.equipment'];
        this.conduitsConfig = myw.config['mywcom.conduits'];
        this.cablesConfig = myw.config['mywcom.cables'];
        this.specsConfig = myw.config['mywcom.specs'];
        this.segmentTypes = CableManagerPlugin.segmentTypes();

        this.specManager = this.app.plugins.specManager;
        this.laborCostsManager = this.app.plugins.laborCostsManager;

        const lengthConfig = myw.config['core.units'].length;
        this.lengthUnitScale = new myw.UnitScale(lengthConfig);
        this.lengthDisplayUnit = myw.applicationDefinition.displayUnits.length; // ENH: Use app
        this.mToDisplayUnit = this.lengthUnitScale.convert(1.0, this.lengthDisplayUnit, 'm');
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        return `${this.msg('type')}: ${this.deltaOwner.getTitle()}`;
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
    async build() {
        this.date = new Date();
        await myw.geometry.init(); // For _getLength

        this.featureData = {};
        this.categoryCosts = {};
        this.currencies = [];
        this.ignoredFeatures = [];

        for (const feature of this.features) {
            const category = this.categoryOf(feature);
            if (!category) continue;

            // Exclude system feature types
            if (feature.getType() == 'mywcom_route_junction') continue;

            // Exclude bundle feature types
            let isBundleType = false;
            if (feature.getType() in this.conduitsConfig) {
                for (const configItemName in this.conduitsConfig) {
                    const configItem = this.conduitsConfig[configItemName];
                    if (configItem.bundle_type == feature.getType()) isBundleType = true;
                }
                if (isBundleType) continue;
            }

            // Exclude equipment features with function 'slack'
            const config = this.equipConfig[feature.getType()];
            if (config && config.function == 'slack') continue;

            // Add to table
            const data = this.getFeatureData(feature, category);
            if (data) {
                if (!this.featureData[category]) this.featureData[category] = {};
                this.featureData[category][data.type] = data;
            }
        }

        //Sum categories for summary table
        this._setCategoryCosts();

        if (this.app.getDelta()) {
            this.deltaOwner = await this.app
                .getDatasource('myworld')
                .getFeatureByUrn(this.app.getDelta());
        }
    }

    /**
     * Get information for 'feature' in 'category'
     * @param {MywFeature} feature
     * @param {String} category
     */
    getFeatureData(feature, category) {
        if (feature.changeType == 'delete') {
            this.ignoredFeatures.push(feature);
            return null;
        }

        const bomFeatureTitle = this._getBOMFeatureTitle(feature);
        const item = this.featureData[category]
            ? this.featureData[category][bomFeatureTitle] || {}
            : {};

        item.type = bomFeatureTitle;
        item.featureType = feature.featureDD.external_name;
        item.specification = this._getSpecUrn(feature);
        if (!item.cost) item.cost = 0;

        //Get length or count
        const isLinear = category == 'routes' || category == 'conduits' || category == 'cables';
        if (isLinear) {
            this._sumLinearData(feature, item);
        } else {
            this._sumPointData(feature, item);
        }

        return item;
    }

    /**
     * Sum all linear costs for a particular feature-spec
     * @param {MywFeature} feature
     * @param {Object} item
     */
    _sumLinearData(feature, item) {
        const {
            length,
            originalLength,
            cost,
            unit_cost,
            laborCost = {},
            currency_unit = ''
        } = this.getLinearFeatureData(feature);

        if (!item.length) item.length = 0;
        if (!item.originalLength) item.originalLength = 0;
        if (!item.laborCost) item.laborCost = {};
        if (!item.quantity) item.quantity = 0;
        const quantity = length - originalLength;

        item.length += length;
        item.originalLength += originalLength;
        item.cost += cost || 0;
        item.unit_cost = unit_cost;
        item.currency_unit = currency_unit;
        item.quantity += quantity;

        for (const [key, value] of Object.entries(laborCost)) {
            if (!item.laborCost[key]) item.laborCost[key] = 0;
            item.laborCost[key] += value;
        }
    }

    /**
     * Sum all point costs for a particular feature-spec
     * @param {MywFeature} feature
     * @param {Object} item
     */
    _sumPointData(feature, item) {
        //If non linear get count
        const data = this.getPointFeatureData(feature);
        if (!data) return [null, null];
        const { count, currency_unit, unit_cost, cost, laborCost = {} } = data;

        if (!item.count) item.count = 0;
        if (!item.quantity) item.quantity = 0;
        if (!item.laborCost) item.laborCost = {};

        item.count += count;
        item.unit_cost = unit_cost;
        item.currency_unit = currency_unit;
        item.cost += cost;
        item.quantity += count;

        for (const [key, value] of Object.entries(laborCost)) {
            if (!item.laborCost[key]) item.laborCost[key] = 0;
            item.laborCost[key] += value;
        }
    }

    /**
     * Sum category costs
     */
    _setCategoryCosts() {
        // For each category...
        for (const [category, data] of Object.entries(this.featureData)) {
            // For each feature type in category
            for (const item of Object.values(data)) {
                if (!this.categoryCosts[category])
                    this.categoryCosts[category] = {
                        material: {},
                        labor: {},
                        quantity: 0
                    };

                // Sum material
                if (!this.categoryCosts[category].material[item.currency_unit])
                    this.categoryCosts[category].material[item.currency_unit] = 0;
                this.categoryCosts[category].material[item.currency_unit] += item.cost;

                // Sum labor
                for (const [key, value] of Object.entries(item.laborCost || {})) {
                    if (!this.categoryCosts[category].labor[key])
                        this.categoryCosts[category].labor[key] = 0;
                    this.categoryCosts[category].labor[key] += value;
                }

                // Sum quantities
                this.categoryCosts[category].quantity += item.quantity || 0;
            }
        }
    }

    /**
     * Get data relevenat to an individual feature
     * Returns dict of data
     * @param {MywFeature} feature
     */
    getPointFeatureData(feature) {
        const item = {};

        //Stash update data for later
        if (feature.changeType == 'update') {
            this.ignoredFeatures.push(feature);
            return;
        }

        item.count = 1;
        item.currency_unit = '';
        item.unit_cost = 0;

        let laborCost;

        const spec = this._getSpec(feature);
        if (spec) {
            item.unit_cost = spec.properties.cost ?? 0;
            item.cost = spec.properties.cost ?? 0;
            const cost_currency = spec.properties.cost_currency ?? '';
            item.currency_unit = cost_currency;
            if (!this.currencies.includes(cost_currency)) {
                this.currencies.push(cost_currency);
            }

            laborCost = this.getPointLaborCost(spec);
        }

        // If feature and spec have labor cost, prioritse feature
        const featureLaborCost = this.getPointLaborCost(feature);
        if (Object.keys(featureLaborCost).length) laborCost = featureLaborCost;

        item.laborCost = laborCost;
        return item;
    }

    /**
     * Calculate length and from that cost for a linear feature
     * @param {MywFeature} feature
     */
    getLinearFeatureData(feature) {
        const linearData = {};
        //For linear features get length
        if (!linearData.length) linearData.length = 0;
        if (!linearData.originalLength) linearData.originalLength = 0;
        const { length, originalLength = 0 } = this._getItemLength(feature);
        linearData.length += length;
        if (originalLength) linearData.originalLength += originalLength;

        const changedLength = length - originalLength;
        let laborCost;

        const spec = this._getSpec(feature);
        if (spec) {
            if (!linearData.cost) linearData.cost = 0;

            const item_length = this.lengthUnitScale.convert(
                spec.properties.item_length,
                spec.properties.item_length_unit || 'm',
                'm'
            );

            const itemCost = spec.properties.item_cost ?? 0;
            const cost_per_meter = itemCost && item_length ? itemCost / item_length : 0;

            const costCurrency = spec.properties.cost_currency ?? '';
            linearData.unit_cost = cost_per_meter;
            linearData.cost += cost_per_meter * changedLength;

            linearData.currency_unit = costCurrency;
            if (!this.currencies.includes(costCurrency)) {
                this.currencies.push(costCurrency);
            }
            laborCost = this.getLinearLaborCost(spec, changedLength);
        }

        // If feature and spec have labor cost, prioritse feature
        const featureLaborCost = this.getLinearLaborCost(feature, changedLength);
        if (Object.keys(featureLaborCost).length) laborCost = featureLaborCost;

        linearData.laborCost = laborCost;
        return linearData;
    }

    /**
     * Get length and base length of 'feature'
     * Returns dict with two keys, length and original length
     * @param {MywFeature} feature
     * @returns {Object}
     */
    _getItemLength(feature) {
        const featureType = feature.getType();
        if (featureType in myw.config['mywcom.cables']) {
            return this._getCableLength(feature);
        }

        const length = this._getLength(feature);

        if (feature.changeType == 'update') {
            const originalLength = this._getLength(feature.base);
            return { length: parseFloat(length), originalLength };
        } else {
            //Insert
            return {
                length: parseFloat(length)
            };
        }
    }

    /**
     * Get length of 'feature'
     * @param {myWorldFeature} feature
     * @returns
     */
    _getLength(feature) {
        const geom = myw.geometry.lineString(feature.geometry.coordinates);
        return geom.length();
    }

    /**
     * Get length of cable by summing length of changed segments
     * @param {MywFeature} feature
     * @returns {Object} length and original length
     */
    _getCableLength(feature) {
        let length = 0;
        let originalLength = 0;
        let baseSegments = [];

        let deltaSegments = this.features.filter(
            segment =>
                this.segmentTypes.includes(segment.getType()) &&
                segment.properties.cable == feature.getUrn()
        );

        if (feature.changeType == 'update') {
            baseSegments = deltaSegments.map(segment => segment.base); //If delete: no original feature

            for (const seg of baseSegments) {
                if (!seg) continue;
                originalLength += this._lengthOf(seg);
            }
        }

        for (const seg of deltaSegments) {
            length += this._lengthOf(seg);
        }
        return { length, originalLength };
    }

    /**
     * Get length of seg as per core trace engine lengthOf()
     * @param {MywFeature} seg
     * @returns {Float} length
     */
    _lengthOf(seg) {
        //Can assume is in meters as defined by mywcom_*_segment length field (as should not be modified in template model)
        let segLength;
        if (seg.properties.length) segLength = seg.properties.length;
        else {
            const geom = myw.geometry.lineString(seg.geometry.coordinates);
            segLength = geom.length();
        }

        if (seg.changeType == 'delete') return -segLength;
        return segLength;
    }

    /**
     * Get point labor cost relating to feature
     * @param {MywFeature} feature
     * @returns {Object} Costs keyed by currency
     */
    getPointLaborCost(feature) {
        const laborCostFeatures = this._getLaborCostFeatures(feature);
        const costs = {};
        for (const laborCostFeature of laborCostFeatures) {
            const currency = laborCostFeature.properties.cost_currency;
            if (!this.currencies.includes(currency)) {
                this.currencies.push(currency);
            }

            if (!costs[currency]) costs[currency] = 0;
            costs[currency] += laborCostFeature.properties.cost;
        }

        return costs;
    }

    /**
     * Get linear labor cost relating to feature
     * @param {MywFeature} feature
     * @param {Float} length in meters
     * @returns {Object} Costs keyed by currency
     */
    getLinearLaborCost(feature, length) {
        const laborCostFeatures = this._getLaborCostFeatures(feature);

        const costs = {};
        for (const laborCostFeature of laborCostFeatures) {
            const currency = laborCostFeature.properties.cost_currency;
            if (!this.currencies.includes(currency)) {
                this.currencies.push(currency);
            }

            if (!costs[currency]) costs[currency] = 0;

            // Convert to cost per meter
            const lengthUnitToMeters = this.lengthUnitScale.convert(
                1.0,
                laborCostFeature.properties.length_unit || 'm',
                'm'
            );
            const costPerMeter = (1 / lengthUnitToMeters) * laborCostFeature.properties.cost;

            costs[currency] += costPerMeter * length;
        }

        return costs;
    }

    /**
     * Gets labor cost features from labor_costs field of feature
     * @param {MywFeature} feature
     * @returns {Array<MywFeature>}
     */
    _getLaborCostFeatures(feature) {
        const laborCostsField = this.laborCostsManager.getLaborCostsFieldNameFor(feature.getType());
        if (!laborCostsField || !feature.properties[laborCostsField]) return [];

        const laborCosts = feature.properties[laborCostsField].split(',');
        const laborCostFeatures = [];
        for (const laborCost of laborCosts) {
            const urn = `mywcom_labor_cost/${laborCost}`;
            const laborCostFeature = this.laborCostsManager.getLaborCostFromUrn(urn);
            if (laborCostFeature) laborCostFeatures.push(laborCostFeature);
        }

        return laborCostFeatures;
    }

    /**
     * Compose title so features of same type are disagregated by spec
     * @param {MywFeature} feature
     * @returns {String}
     */
    _getBOMFeatureTitle(feature) {
        const specUrn = this._getSpecUrn(feature);
        if (specUrn) {
            return `${feature.featureDD.external_name} - ${specUrn}`;
        } else {
            return feature.featureDD.external_name;
        }
    }

    /**
     * Gets spec from specification field of feature
     * @returns Spec or undefined
     */
    _getSpec(feature) {
        //Get cost of each unit from spec
        const specFieldName = this.specsConfig[feature.getType()];
        if (specFieldName in feature.featureDD.fields && feature.properties[specFieldName]) {
            const specUrn = `${feature.getType()}_spec/${feature.properties[specFieldName]}`;
            const spec = this.specManager.specCache[specUrn];
            return spec;
        }
    }

    /**
     * Get specUrn if exists of 'feature' from configured specField
     */
    _getSpecUrn(feature) {
        const specFieldName = this.specsConfig[feature.getType()];
        return feature.properties[specFieldName] || null;
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
        strm.newSection(this.msg('summary'));

        // Show report type
        strm.writeHeading(3, this.typeName());

        // Show object being reported on
        strm.writeHeading(1, this.deltaOwner.getTitle());

        // Add generation date
        strm.writeLine(this.msg('date'), ': ', this.date.toLocaleDateString());

        strm.writeLine();
    }

    /**
     * Output content as a table
     */
    writeBody(strm) {
        // Determine if we should include units in table values
        // ENH: Extent report streams to support column properties unit + currrency and remove this
        this.showUnits = !['xlsx', 'csv'].includes(strm.type);

        // Write Summary
        this.writeSummaryTable(strm);

        // Write table for each category
        for (const category of this.categories) {
            const items = this.featureData[category];
            if (!items) continue;

            const nLines = Object.keys(items).length;
            strm.newSection(this.msg(category), nLines);
            strm.writeHeading(2, this.msg(category));

            const isLinear = category == 'routes' || category == 'conduits' || category == 'cables';
            const features = this.featureData[category];
            if (isLinear) {
                this.writeLinearFeaturesTab(strm, features);
            } else {
                this.writePointFeaturesTab(strm, features);
            }
        }

        // Write ignored changes
        if (this.ignoredFeatures.length) {
            strm.newSection(this.msg('ignored_features'), this.ignoredFeatures.length);
            strm.writeHeading(2, this.msg('ignored_features'));
            this.writeIgnoredFeaturesTab(strm, this.ignoredFeatures);
        }
    }

    /**
     * Write summary table outputting cost for each category and total cost
     */
    writeSummaryTable(strm) {
        const cols = ['category', 'quantity', 'material_cost'];
        const colHeadings = {
            category: this.colHeading('category'),
            quantity: this.colHeading('quantity')
        };

        const colStyles = {};

        const categoryCost = {};
        for (const currency of this.currencies) {
            this._addCostColumns(colHeadings, colStyles, cols, currency);
            categoryCost[currency] = 0;
        }

        const tab = new ReportTable(cols);
        let totalLabor = {};
        let totalMaterial = {};
        for (const category of this.categories) {
            if (!(category in this.featureData)) continue;
            tab.nextRow();
            tab.add('category', this.msg(category));

            if (this.categoryCosts[category]) {
                const isLinear =
                    category == 'routes' || category == 'conduits' || category == 'cables';

                let quantity = this.categoryCosts[category].quantity;
                if (isLinear) quantity = this.formatLength(quantity);

                tab.add('quantity', quantity);
                for (const currency of this.currencies) {
                    tab.add(
                        `material-cost:${currency}`,
                        this.formatCost(this.categoryCosts[category].material[currency], currency)
                    );

                    if (!totalMaterial[currency]) totalMaterial[currency] = 0;
                    totalMaterial[currency] += this.categoryCosts[category].material[currency] || 0;

                    tab.add(
                        `labor-cost:${currency}`,
                        this.formatCost(this.categoryCosts[category].labor[currency], currency)
                    );

                    if (!totalLabor[currency]) totalLabor[currency] = 0;
                    totalLabor[currency] += this.categoryCosts[category].labor[currency] || 0;
                }
            }
        }

        this._addTotalsToTab(tab, totalMaterial, totalLabor);

        const options = { colHeadings, colStyles, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);

        strm.writeLine();
    }

    /**
     * Write table to stream for point comms features
     */
    writePointFeaturesTab(strm, features) {
        // Build headings
        const cols = ['feature', 'specification', 'unit_cost', 'quantity'];
        const colHeadings = {
            feature: this.colHeading('feature'),
            specification: this.colHeading('specification'),
            quantity: this.colHeading('quantity'),
            unit_cost: this.colHeading('point_unit_cost')
        };

        const colStyles = {
            quantity: { hAlign: 'right' },
            unit_cost: { hAlign: 'right' },
            material_cost: { hAlign: 'right' },
            total_cost: { hAlign: 'right' }
        };

        const categoryCost = { material: {}, labor: {} };
        for (const currency of this.currencies) {
            this._addCostColumns(colHeadings, colStyles, cols, currency);
            categoryCost.material[currency] = 0;
            categoryCost.labor[currency] = 0;
        }

        // Sort data by featureType + specification
        const types = Object.values(features)
            .map(item => item.type)
            .sort((a, b) => {
                return strCmp(a, b);
            });

        // Build table
        const tab = new ReportTable(cols);

        for (const type of types) {
            const data = features[type];
            tab.nextRow();
            tab.add('feature', data.featureType);
            tab.add('specification', data.specification || '-');
            tab.add('quantity', data.count);
            tab.add('unit_cost', this.formatCost(data.unit_cost, data.currency_unit, true));

            for (const currency of this.currencies) {
                let cost;
                if (currency == data.currency_unit) {
                    cost = data.cost;
                    categoryCost.material[currency] += cost;
                }

                const laborCost =
                    data.laborCost && data.laborCost[currency] ? data.laborCost[currency] : 0;
                categoryCost.labor[currency] += laborCost;

                tab.add(`material-cost:${currency}`, this.formatCost(cost, currency));
                tab.add(`labor-cost:${currency}`, this.formatCost(laborCost, currency));
            }
        }

        this._addTotalsToTab(tab, categoryCost.material, categoryCost.labor);

        const options = { colHeadings, colStyles, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);

        strm.writeLine();
    }

    /**
     * Write table to strm for linear comms features
     */
    writeLinearFeaturesTab(strm, features) {
        const cols = ['feature', 'specification', 'unit_cost', 'length'];

        const colHeadings = {
            feature: this.colHeading('feature'),
            specification: this.colHeading('specification'),
            length: this.colHeading('length', 'length'),
            unit_cost: this.colHeading('unit_cost')
        };

        const colStyles = {
            length: { hAlign: 'right' },
            unit_cost: { hAlign: 'right' },
            material_cost: { hAlign: 'right' },
            total_cost: { hAlign: 'right' }
        };

        const categoryCost = { material: {}, labor: {} };
        for (const currency of this.currencies) {
            this._addCostColumns(colHeadings, colStyles, cols, currency);
            categoryCost.material[currency] = 0;
            categoryCost.labor[currency] = 0;
        }

        //Sort by type (which is str composed of featureType and specification)
        const types = Object.values(features)
            .map(item => item.type)
            .sort((a, b) => {
                return strCmp(a, b);
            });

        const tab = new ReportTable(cols);

        for (const type of types) {
            const data = features[type];
            tab.nextRow();
            tab.add('feature', data.featureType);
            tab.add('specification', data.specification || '-');
            tab.add('length', this.formatLength(data.length - data.originalLength));

            let unit_cost_str;
            if (data.unit_cost) {
                const cost_per_app_unit = this.mToDisplayUnit * data.unit_cost;
                const cost_per_app_unit_str = this.formatCost(
                    cost_per_app_unit,
                    data.currency_unit,
                    true
                );
                unit_cost_str = `${cost_per_app_unit_str}/${this.lengthDisplayUnit}`;
            }
            tab.add('unit_cost', unit_cost_str);

            for (const currency of this.currencies) {
                let cost;
                if (currency == data.currency_unit) {
                    cost = data.cost;
                    categoryCost.material[currency] += cost;
                }
                const laborCost =
                    data.laborCost && data.laborCost[currency] ? data.laborCost[currency] : 0;
                categoryCost.labor[currency] += laborCost;

                tab.add(`material-cost:${currency}`, this.formatCost(cost, currency));
                tab.add(`labor-cost:${currency}`, this.formatCost(laborCost, currency));
            }
        }

        // Add totals row
        this._addTotalsToTab(tab, categoryCost.material, categoryCost.labor);

        const options = { colHeadings, colStyles, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);

        strm.writeLine();
    }

    /**
     * Output feature title, category and change type to show user which features are not considered in BOM report
     */
    writeIgnoredFeaturesTab(strm, features) {
        const cols = ['category', 'title', 'change_type'];
        const colHeadings = {
            category: this.colHeading('category'),
            title: this.colHeading('title'),
            change_type: this.colHeading('change_type')
        };

        const tab = new ReportTable(cols);
        for (const feature of features) {
            tab.nextRow();
            tab.add('category', this.msg(this.categoryOf(feature)));
            tab.add('title', feature.getTitle());
            tab.add('change_type', this.msg(feature.changeType));
        }

        const options = { colHeadings, colStyles: {}, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);

        strm.writeLine();
    }

    // -----------------------------------------------------------------------------
    //                              HELPERS
    // -----------------------------------------------------------------------------

    _addCostColumns(colHeadings, colStyles, cols, currency) {
        for (const colName of ['material-cost', 'labor-cost']) {
            const tabColName = `${colName}:${currency}`;
            cols.push(tabColName);
            colHeadings[tabColName] = this.colHeading(colName, currency);
            colStyles[tabColName] = { hAlign: 'right' };
        }
    }

    _addTotalsToTab(tab, totalMaterial, totalLabor) {
        // Add totals row
        tab.nextRow();
        tab.add('category', { value: this.msg('total'), bold: true });
        for (const currency of this.currencies) {
            tab.add(`material-cost:${currency}`, {
                value: this.formatCost(totalMaterial[currency], currency),
                bold: true
            });
            tab.add(`labor-cost:${currency}`, {
                value: this.formatCost(totalLabor[currency], currency),
                bold: true
            });
        }
    }

    /**
     * Build a column heading
     *
     * Optional 'unit' is 'length' or a currency
     */
    // ENH: Support column property 'unit_scale' in streams and remove this
    colHeading(msgId, unit = undefined) {
        let heading = this.msg(msgId);
        if (!unit) return heading;

        if (unit == 'length') {
            // Case length: Show unit in title if not in value
            unit = this.showUnits ? undefined : this.lengthDisplayUnit;
        } else {
            // Case currency: Show unit in title unless just one currency
            if (this.showUnits && this.currencies.length < 2) unit = undefined;
        }

        if (unit) {
            heading += ` (${unit})`;
        }

        return heading;
    }

    /**
     * Gets 'length' (a distance in m) as string in application units
     */
    // ENH: Support unit conversion in streams and remove this
    formatLength(length) {
        if (!length) return;
        const unitValue = this.lengthUnitScale.value(length, 'm');

        return this.showUnits
            ? unitValue.toString(this.lengthDisplayUnit)
            : unitValue.valueIn(this.lengthDisplayUnit).toFixed(2);
    }

    /**
     * Format currency quantity 'value' for output
     */
    // ENH: Support column property 'currency' in streams and remove this
    formatCost(value, currency, showUnits = undefined) {
        if (showUnits === undefined) showUnits = this.showUnits;

        if (!value) return showUnits ? '-' : '';
        value = value.toFixed(2);
        if (value == '-0.00') value = '0.00';
        return showUnits ? `${currency}${value}` : value;
    }

    /**
     * Category of 'feature'
     */
    categoryOf(feature) {
        if (feature.getType() in this.structsConfig) return 'structures';
        if (feature.getType() in this.routesConfig) return 'routes';
        if (feature.getType() in this.equipConfig) return 'equipment';
        if (feature.getType() in this.conduitsConfig) return 'conduits';
        if (feature.getType() in this.cablesConfig) return 'cables';
    }
}
