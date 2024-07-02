// Copyright: IQGeo Limited 2010-2023
import { Plugin } from 'myWorld-client';
import myw from 'myWorld-client';
import { isNull, findKey, sortBy } from 'underscore';
import LineOfCountDialog from './lineOfCountDialog';
import PinRange from '../api/pinRange';

export default class LOCManagerPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'LOCManager';
    }

    /**
     * @class Provides API for routing and maintaining line of count information
     * associated to cable segments or equipment.
     *
     * Line of count information is cached on features and comes in two forms:
     *    _loc_config - Line of count information that is editable or might be updated after a ripple.
     *    _loc_details - Line of count information that is displayed in cable trees. Might include proposed information.
     *
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        // Set initial state when other plugins have been initialized
        this.app.ready.then(async () => {
            this.autoRipple = myw.config['mywcom.line_of_count']['connect_disconnect_auto_ripple'];
            this.app.on('featureCollection-modified', this.handleFeatureModified, this);
        });
    }

    /**
     * Handles feature modified for containers of line of count. Will fire feature modified for LOC
     * features so that layer is refreshed etc.
     * @param {*} event
     */
    handleFeatureModified(event) {
        if (
            this.app.plugins.structureManager.routeFeatureTypes.includes(event.featureType) ||
            this.app.plugins.structureManager.structureFeatureTypes.includes(event.featureType) ||
            this.app.plugins.structureManager.equipmentFeatureTypes.includes(event.featureType) ||
            this.app.plugins.structureManager.cableFeatureTypes.includes(event.featureType)
        ) {
            this.fireFeatureEvents();
        }
    }

    /**
     * Fetches line of count configuration for a feature and updates local cache
     * @param {MywFeature} feature
     * @param {string} side
     * @param {boolean} force - Will force a fetch from server
     */
    async setFeatureLOC(feature, side, force = false) {
        if (!feature._loc_config || force) {
            if (side) {
                if (!feature._loc_config) feature._loc_config = {};
                feature._loc_config[side] = await this.getFeatureLOC(feature, side);
            } else {
                feature._loc_config = await this.getFeatureLOC(feature);
            }
        }
    }

    /**
     * Fetches line of count configuration features and updates local cache.
     * @param {Objects} feature URNs -> features
     */
    async getFeaturesLOCConfig(originFeature, featureQURNs) {
        if (!featureQURNs || Object.keys(featureQURNs).length == 0) return;

        const loc_data = await originFeature.datasource.getFeaturesLOC(Object.keys(featureQURNs));

        // Cache results on features
        Object.keys(loc_data).map(urn => {
            const loc_cfg = loc_data[urn];
            if (loc_cfg && Object.keys(loc_cfg).length > 0) {
                featureQURNs[urn]._loc_config = loc_cfg;
            }
        });

        return loc_data;
    }

    /**
     * Ripples line of count information down the network.
     *
     * Note: This does not send updates back to server. Caller will typically
     * request confirmation from user and then call updateFeaturesLOC
     *
     * @param {Feature} originFeature - Feature to ripple from
     * @param {string} side - Side of feature rippling from
     * @param {*} originConfig - LOC configuration at origin
     * @return {Array<MywFeature>} - List of features with new LOC information to be updated
     */
    async ripple(originFeature, side, originConfig) {
        const rippleResult = await originFeature.datasource.comms.ripple(
            originFeature,
            side,
            originConfig
        );
        return this.processRippleResult(originFeature, side, originConfig, rippleResult);
    }

    /**
     * Process results from a ripple trace so that UI can display results to user. Does not send results
     * back to server.
     * @param {*} originFeature
     * @param {*} side
     * @param {*} originConfig
     * @param {*} rippleResult
     * @returns Lists of features with new LOC information and features that need to be updated
     */
    async processRippleResult(originFeature, side, originConfig, rippleResult) {
        // These are the segments that will be updated
        let downstreamFeatures = [];

        // Will gather the segments that need to be updated
        let updatedFeatures = [];

        const originatingStrandStatus = this.parseStrandStatusFromConfig(originConfig);
        const rippleFeatures = rippleResult['features'];

        const keys = Object.keys(rippleFeatures);

        // Turn features into actual features making use of a single server call
        const entry_features = Object.values(rippleFeatures).map(entry => entry.feature);
        const features = await originFeature.datasource.asFeatures({ features: entry_features });
        features.forEach(feature => {
            let entry = rippleFeatures[feature.getUrn()];

            // Handle case where feature appears in results under
            // side qualified URN.
            if (!entry) {
                ['in', 'out'].forEach(side => {
                    entry = rippleFeatures[feature.getUrn() + '?side=' + side];
                    if (entry) entry.feature = feature;
                });
            } else {
                entry.feature = feature;
            }
        });

        // Get configuration for all features we are updating
        const featureURNs = Object.fromEntries(
            Object.values(rippleFeatures).map(entry => [entry.feature.getUrn(), entry.feature])
        );
        await this.getFeaturesLOCConfig(featureURNs);

        await Promise.all(
            keys.map(async qurn => {
                const entry = rippleFeatures[qurn];
                const downstreamFeature = entry.feature;

                // Updates *local* copy of segment with new LOC information
                const updatedFeature = await this.processRippleResultFeature(
                    downstreamFeature,
                    originFeature,
                    entry.mapping,
                    entry.side,
                    originatingStrandStatus
                );

                downstreamFeature._seq = entry.seq;

                if (updatedFeature) {
                    updatedFeature._seq = entry.seq;
                    updatedFeatures.push(updatedFeature);
                    downstreamFeatures.push(updatedFeature);
                } else downstreamFeatures.push(downstreamFeature);
            })
        );

        // Could have sorted original list but not guaranteed that Promise.all resolves
        // in the same order as input list.

        const compareFn = function (x, y) {
            const x_seq = x._seq;
            const y_seq = y._seq;
            if (x_seq.length < y_seq.length) return -1;
            if (x_seq.length > y_seq.length) return 1;
            if (x_seq < y_seq) return -1;
            if (x_seq > y_seq) return 1;
            return 0;
        };

        downstreamFeatures.sort(compareFn);
        updatedFeatures.sort(compareFn);

        return updatedFeatures;
    }

    /**
     * Number of pins in FEATURE
     *
     * @param {*} feature
     * @returns
     */
    countFor(feature) {
        return feature.properties.fiber_count || feature.properties.copper_count;
    }

    /**
     * Process LOC information on local copy of segment from ripple trace information and
     * ensuring we don't overwrite existing assignment that are not part of the ripple.
     *
     * @param {Feature} downstreamFeature - Feature we are updating
     * @param {Feature} originFeature - Feature ripple started from
     * @param {Object} mapping - Mapping from source pin on originFeature to pin on downstreamFeature
     * @param {String} side
     * @param {Object} originatingStrandStatus
     * @returns
     */
    async processRippleResultFeature(
        downstreamFeature,
        originFeature,
        mapping,
        side,
        originatingStrandStatus
    ) {
        const pinCount = await this.pinCountFor(downstreamFeature, side);

        await this.setFeatureLOC(downstreamFeature, side);

        const currentFeatureCount = this.parseStrandStatus(downstreamFeature, side) || [];
        const currentFeaturePins = currentFeatureCount.length;

        let newConfig = [];
        let prevPlaceholder = 0;
        let newStatus = undefined;
        for (let currentPin = 1; currentPin <= pinCount; currentPin++) {
            [newStatus, prevPlaceholder] = this.newStatusFor(
                downstreamFeature,
                currentPin,
                mapping,
                originatingStrandStatus,
                prevPlaceholder,
                currentFeaturePins,
                currentFeatureCount
            );
            newConfig.push(newStatus);
        }

        // Compress the count structure so that we don't have a single count number range for every fiber
        newConfig = this.compressLoc(newConfig);

        const valid = this.rippleValidate(newConfig, side);
        if (!valid) {
            throw new myw.Error({
                id: 'invalid_line_of_count_ripple',
                feature: downstreamFeature.getTitle()
            });
        }

        if (side) {
            downstreamFeature._loc_config ||= {};
            downstreamFeature._loc_side = side;
            if (downstreamFeature._loc_config[side] != newConfig) {
                downstreamFeature._loc_config[side] = newConfig;
                return downstreamFeature;
            }
        } else {
            if (downstreamFeature._loc_config != newConfig) {
                downstreamFeature._loc_config = newConfig;
                return downstreamFeature;
            }
        }

        return;
    }

    /**
     * Validate line of count at a container after a ripple.
     * @param {*} cfg
     * @param {*} side
     * @returns
     */
    rippleValidate(cfg, side) {
        const ranges = {};
        for (const locRow of cfg) {
            // Now skip physical rows or no-name ones
            if (!locRow.name || locRow.physical) continue;

            // Check for overlapping ranges with the same name and differenct line of count
            // For the same line of count, splitters are allowed to have overlapping ranges
            const newRange = new PinRange(side, locRow.low, locRow.high);
            if (
                ranges[locRow.name] &&
                ranges[locRow.name].some(
                    entry => entry.range.overlap(newRange) && locRow.loc_ref != entry.loc_ref
                )
            ) {
                return false;
            }

            if (!ranges[locRow.name]) {
                ranges[locRow.name] = [];
            }
            ranges[locRow.name].push({ range: newRange, loc_ref: locRow.loc_ref });
        }
        return true;
    }

    /**
     * Create new status for pin on segment using ripple trace results
     *
     * @param {MywFeature} feature
     * @param {Number} currentPin
     * @param {Object} mapping
     * @param {Object} originatingStrandStatus
     * @param {Number} prevPlaceholder
     * @param {Object} currentFeaturePins
     * @param {Number} currentFeatureCount
     * @returns
     */
    newStatusFor(
        feature,
        currentPin,
        mapping,
        originatingStrandStatus,
        prevPlaceholder,
        currentFeaturePins,
        currentFeatureCount
    ) {
        // This is the fiber on the origin segment that we trace from to
        // the fiber on current segment.
        const originPin = findKey(mapping, val => val.includes(currentPin));

        let newStatus = undefined;

        if (originPin) {
            const originStatus = originatingStrandStatus[originPin - 1];

            if (!originStatus) {
                // Include a place holder
                prevPlaceholder += 1;
                newStatus = {
                    name: '',
                    status: '',
                    low: prevPlaceholder,
                    high: prevPlaceholder
                };
            } else {
                newStatus = {
                    name: originStatus.name,
                    status: originStatus.status,
                    low: originStatus.count,
                    high: originStatus.count,
                    loc_ref: originStatus.loc_ref,
                    mapping: mapping,
                    loc_index: originStatus.loc_index
                };
                prevPlaceholder = 0;
            }
        } else {
            // Ripple trace didn't reach this pin on this feature
            // Retain the original count
            if (currentPin <= currentFeaturePins) {
                const currentStatus = currentFeatureCount[currentPin - 1];
                newStatus = {
                    name: currentStatus.name,
                    status: currentStatus.status,
                    low: currentStatus.count,
                    high: currentStatus.count,
                    loc_ref: currentStatus.loc_ref,
                    loc_section_ref: currentStatus.loc_section_ref
                };
                prevPlaceholder = 0;
            } else {
                // Include a place holder
                prevPlaceholder += 1;
                newStatus = {
                    name: '',
                    status: '',
                    low: prevPlaceholder,
                    high: prevPlaceholder
                };
            }
        }

        myw.trace('loc_plugin', 1, feature.getUrn(), currentPin, newStatus.name, newStatus.loc_ref);

        return [newStatus, prevPlaceholder];
    }

    /**
     * Do updates after a ripple. Sends changes back to server and marks line of counts as non-stale
     *
     * @param {Array<MywFeature} features
     */
    async rippleUpdate(features, owningFeature, side, originConfig) {
        const transaction = new myw.Transaction(this.app.database);
        let hasUpdates = false;

        // Save and get latest LOC configuration from server for origin which include record
        // references for any new line of count information
        await this.updateFeatureLOC(owningFeature, originConfig, true, side);
        await this.setFeatureLOC(owningFeature, side, true);
        originConfig = side ? owningFeature._loc_config[side] : owningFeature._loc_config;

        // Set loc record references on features if not set
        features.forEach(feature => {
            const cfg = feature._loc_config;
            if (!cfg) return;

            const subCfg = this.subConfigFor(cfg);
            subCfg.forEach(cfg =>
                cfg.forEach(row => {
                    if (row.loc_index != undefined && !row.loc_ref && originConfig[row.loc_index]) {
                        row.loc_ref = originConfig[row.loc_index].loc_ref;
                    }
                })
            );
        });

        if (hasUpdates) await this.app.database.runTransaction(transaction);

        await this.updateFeaturesLOC(features);

        this.fireFeatureEvents();
    }

    /**
     * Provides uniform list of configuration parts for equipment with sides and segments
     * @param {*} cfg
     * @returns
     */
    subConfigFor(cfg) {
        if (!cfg['in'] && !cfg['out']) return [cfg];

        const subCfg = [];
        for (const side of ['in', 'out']) {
            if (cfg[side]) subCfg.push(cfg[side]);
        }
        return subCfg;
    }

    /**
     * Send LOC configurations for features back to server
     * @param {*} features
     */
    async updateFeaturesLOC(features) {
        if (features.length == 0) return;
        return features[0].datasource.comms.updateFeaturesLOC(features);
    }

    /** Update line of count configuration for FEATURE
     *
     */
    async updateFeatureLOC(feature, cfg, origin = false, side = undefined, markStale = false) {
        // Update local cache
        if (side) {
            feature._loc_config ||= {};
            feature._loc_config[side] = cfg;
        } else {
            feature._loc_config = cfg;
        }
        feature._loc_origin = origin;

        return feature.datasource.comms.updateFeaturesLOC([feature], markStale);
    }

    /**
     * Format as an HTML string line of count configuration for FEATURE
     * from ripple data
     * @param {MywFeature} seg
     * @returns
     */
    formattedLocFromRipple(feature, side = undefined, originConfig = undefined) {
        const locCfg = side ? feature._loc_config[side] : feature._loc_config;

        if (!locCfg) return '';

        let pLow = 1;
        const lines = [];
        locCfg.forEach(row => {
            lines.push(
                this.formatLocLine(
                    row.name,
                    pLow,
                    row.low,
                    row.high,
                    row.status,
                    row.physical,
                    true
                )
            );
            pLow += row.high - row.low + 1;
        });

        return lines;
    }

    /**
     * Format as an HTML string line of count configuration for FEATURE
     * @param {MywFeature} seg
     * @returns
     */
    formattedLoc(feature, side = undefined) {
        const locCfg = this.featureLOCDetails(feature, side);
        if (!locCfg || !locCfg['']) return '';

        const lines = locCfg[''].map(row => {
            return this.formatLocLine(
                row.name,
                row.physical_low,
                row.low,
                row.high,
                row.status,
                row.physical,
                true
            );
        });

        return lines.join('<br>');
    }

    /**
     * Get line of coutn status picklist
     *
     * @returns
     */
    async statusPicklist() {
        const segFeatureType = 'mywcom_line_of_count';

        const dd = await this.owner.database.getDDInfoFor([segFeatureType]);
        return dd[segFeatureType].fields.status.enumValues.map(enumVal => enumVal.value);
    }

    /**
     * Get line of count configuration for FEATURE
     *
     * @param {MywFeature} feature
     * @returns
     */
    async getFeatureLOC(feature, side = undefined) {
        const loc = await feature.datasource.comms.getFeaturesLOC([feature.getUrn()]);
        return side ? loc[feature.getUrn()][side] : loc[feature.getUrn()];
    }

    /**
     * Get line of count configuration for multiple features. Caches result on features.
     *
     * @param {Array<String>} featureQURNs - List of feature qualified URNs
     * @returns {Object} - Map of feature QURN to line of count configuration
     */
    async getFeaturesLOCDetails(features, include_proposed = false) {
        if (!features || features.length == 0) return;

        const featureQURNs = Object.fromEntries(
            features.map(feature => [feature.getUrn(), feature])
        );
        const loc_data = await features[0].datasource.comms.getFeaturesLOCDetails(
            Object.keys(featureQURNs),
            include_proposed
        );

        // Cache results on features
        Object.keys(loc_data).map(urn => {
            const loc_details = loc_data[urn];
            if (loc_details && Object.keys(loc_details).length > 0) {
                featureQURNs[urn]._loc_details = loc_details;
            }
        });

        return loc_data;
    }

    /**
     * Unpack line of count configuration to give status for each strand in the cable
     *
     * @param {MywFeature} feature
     * @returns
     */
    parseStrandStatus(feature, side) {
        const cfg = side && feature._loc_config ? feature._loc_config[side] : feature._loc_config;
        if (!cfg) return [];
        return this.parseStrandStatusFromConfig(cfg);
    }

    parseStrandStatusFromConfig(cfg) {
        let strands = [];

        for (const [loc_index, entry] of cfg.entries()) {
            for (let i = entry.low; i <= entry.high; i++) {
                strands.push({
                    name: entry.name,
                    status: entry.status,
                    count: i,
                    loc_ref: entry.loc_ref,
                    loc_section_ref: entry.loc_section_ref,
                    loc_index: loc_index
                });
            }
        }

        return strands;
    }

    /**
     * Format LOC information to a string.
     *
     * @param {String} name
     * @param {String} pCountLow
     * @param {String} countLow
     * @param {String} countHigh
     * @param {String} status
     * @param {Boolean} physicalOnly
     * @param {Boolean} forceLine
     * @returns
     */
    formatLocLine(
        name,
        pCountLow,
        countLow,
        countHigh = null,
        status = null,
        physicalOnly = false,
        forceLine = false
    ) {
        // Ensure counts are strings (to ensure consistent nully check) - FIXME. Still neeeded?

        if (!isNull(countLow)) countLow = countLow.toString();
        if (!isNull(countHigh)) countHigh = countHigh.toString();

        // Make sure we have a name or a status, otherwise treat it as some 'filler'
        if (!forceLine && !name && !status) return '';

        // If we just have one count number, display as single value, otherwise show as range [low-high]
        //let rangeStr;
        let str = '';

        let loc_data = {};

        // Line for single strand only
        if (!countHigh) {
            if (physicalOnly) {
                loc_data = { loc_status: status };
            } else {
                loc_data = {
                    loc_name: name,
                    loc_low: countLow,
                    loc_status: status
                };
            }
            // Only show status
        } else if (physicalOnly) {
            loc_data = {
                loc_p_low: pCountLow,
                loc_p_high: pCountLow + (countHigh - countLow),
                loc_status: status
            };
            // Show all for a range
        } else {
            loc_data = {
                loc_p_low: pCountLow,
                loc_p_high: pCountLow + (countHigh - countLow),
                loc_name: name,
                loc_low: countLow,
                loc_high: countHigh,
                loc_status: status
            };
        }

        const showRange = countHigh ? 'range' : 'single';
        const showPhysical = physicalOnly ? 'physical' : 'assigned';

        str = this.msg(`line_of_count_${showPhysical}_${showRange}`, loc_data);

        return str;
    }

    /**
     * Compress a list of line of count records so that adjacent ranges are merged.
     *
     * @param {*} cfg
     * @returns
     */
    compressLoc(cfg) {
        const compressedCfg = [];

        let currentCompress;

        cfg.forEach(row => {
            if (!currentCompress) {
                currentCompress = row;
            } else {
                // If current is continuation of previous line of count, then merge otherwise start a new row
                if (
                    row.name == currentCompress.name &&
                    row.status == currentCompress.status &&
                    row.loc_ref == currentCompress.loc_ref &&
                    row.low == currentCompress.high + 1
                ) {
                    currentCompress.high = row.high;
                } else {
                    compressedCfg.push(currentCompress);
                    currentCompress = row;
                }
            }
        });

        if (currentCompress && (currentCompress.name || currentCompress.status))
            compressedCfg.push(currentCompress);

        return compressedCfg;
    }

    /**
     * Open line of count editor for FEATURE (such as a cable segment)
     *
     * @param {MywFeature} feature
     */
    openLineOfCountDialog(feature, side) {
        new LineOfCountDialog(feature, this, side);
    }

    /**
     * Validate line of count configuration
     *
     * @param {*} cfg
     * @returns
     */
    async validate(cfg, feature, side) {
        // Check we have low/high
        let completeRows = true;
        let total = 0;
        const ranges = {};
        for (const locRow of cfg) {
            const low = locRow.low || locRow.low == 0 ? locRow.low : null;
            const high = locRow.high || locRow.high == 0 ? locRow.high : null;

            if (!low || !high) {
                completeRows = false;
            } else {
                total += high - low + 1;
            }

            if (low > high) {
                return { valid: false, msg: 'low_greater_than_high', args: {} };
            }

            // Now skip physical rows or no-name ones
            if (!locRow.name || locRow.physical) continue;

            // Check for overlapping ranges with the same name
            const newRange = new PinRange(side, locRow.low, locRow.high);
            if (ranges[locRow.name] && ranges[locRow.name].some(range => range.overlap(newRange))) {
                return {
                    valid: false,
                    msg: 'overlapping_ranges',
                    args: {
                        name: locRow.name,
                        low: locRow.low,
                        high: locRow.high,
                        status: locRow.status
                    }
                };
            }

            if (!ranges[locRow.name]) {
                ranges[locRow.name] = [];
            }
            ranges[locRow.name].push(newRange);
        }

        if (!completeRows) {
            return { valid: false, msg: 'incomplete_rows', args: {} };
        }

        const count = await this.pinCountFor(feature, side);

        if (total > count) {
            return { valid: false, msg: 'too_many', args: { total: total, count: count } };
        }

        return { valid: true, config: cfg };
    }

    /**
     * Return pin count for feature and side (if specified)
     *
     * @returns
     */
    async pinCountFor(feature, side) {
        return this.app.plugins.cableManager.pinCountFor(feature, side);
    }

    /**
     * Determines if feature's LOC are editable.
     *
     * Editable if it is origin of any line of count information it has.
     *
     * ENH: As LOC rippling can impact outside of local area, maybe limit it to a role?
     *
     * @param {*} feature
     * @returns
     */
    isLocEditable(feature, side = undefined) {
        if (!feature._loc_config && !feature._loc_details) return true;

        let cfg = undefined;

        if (feature._loc_config) {
            cfg = side ? feature._loc_config[side] : feature._loc_config;
        } else {
            cfg = side ? feature._loc_details[side][''] : feature._loc_details[''];
        }

        if (!cfg || cfg.length == 0) return true;

        const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();

        return cfg.some(loc => loc.origin == qurn);
    }

    /**
     * Handle connection event for line of count
     *
     * @param {Object} event
     */
    async handleConnect(event) {
        const conn = event.conn;
        await conn.datasource.comms.connectLOC(conn, event.ripple);
        this.fireFeatureEvents();
    }

    /**
     * Handle disconnection event for line of count
     *
     * @param {Object} event
     */
    async handleDisconnect(event) {
        const feature = event.feature;
        const segmentTypes = this.app.plugins.cableManager.constructor.segmentTypes();
        const side = segmentTypes.includes(feature.type) ? undefined : event.pins.side;

        await feature.datasource.comms.disconnectLOC(feature, side, event.ripple);
        this.fireFeatureEvents();
    }

    /**
     * Determines if feature has line of count information
     */
    hasLOC(feature) {
        return !!(feature._loc_config || feature._loc_details);
    }

    statusForPin(strandStatusLoc, pin) {
        const strandStatus = [];
        for (const delta of Object.keys(strandStatusLoc)) {
            for (const loc of strandStatusLoc[delta]) {
                let plow = loc.physical_low;
                const phigh = loc.physical_low + (loc.high - loc.low);
                if (pin >= plow && pin <= phigh) {
                    strandStatus.push({
                        name: loc.name,
                        status: loc.status,
                        count: loc.low + (pin - plow),
                        myw_delta: loc.myw_delta,
                        myw_delta_owner_title: loc.myw_delta_owner_title,
                        physical: loc.physical
                    });
                }
                plow = phigh + 1;
            }
        }

        return strandStatus;
    }

    /**
     * Return line of count details for feature
     *
     * @param {MywFeature feature
     * @param {String} side
     * @returns
     */
    featureLOCDetails(feature, side = undefined) {
        if (!feature._loc_details) return;

        return side ? feature._loc_details[side] : feature._loc_details;
    }

    /**
     * Add line of count information to pinNodes
     *
     * @param {*} pinNodes
     * @param {*} strandStatusLoc
     */
    addStrandStatusToPins(pinNodes, feature, side) {
        const strandStatusLoc = this.featureLOCDetails(feature, side);

        if (!strandStatusLoc || !Object.values(strandStatusLoc).length) return;

        Object.keys(pinNodes).forEach(pin => {
            const strandStatus = this.statusForPin(strandStatusLoc, pin);

            if (!Object.values(strandStatus).length) return;

            let proposedLoc = '';
            let actualLoc = '';

            for (const locDetail of strandStatus) {
                const locStr = this.formatLocLine(
                    locDetail.name,
                    null,
                    locDetail.count,
                    null,
                    locDetail.status,
                    locDetail.physical
                );

                if (!locStr) continue;

                if (locDetail.myw_delta && locDetail.myw_delta != this.app.getDelta()) {
                    proposedLoc += this.app.plugins.displayManager._proposedText(
                        locStr,
                        locDetail.myw_delta_owner_title
                    );
                    pinNodes[pin].link = locDetail.myw_delta;
                } else {
                    actualLoc = `${locStr}`;
                }
            }

            const statusLocHtml = `<div class="strand-loc">${actualLoc} <span class='strand-loc-proposed'>${proposedLoc}</span></span>`;

            pinNodes[pin].text += statusLocHtml;
        });
    }

    /**
     * Fires feature modified events for line of count features
     */
    fireFeatureEvents() {
        this.app.fire('featureCollection-modified', { featureType: 'mywcom_line_of_count' });
        this.app.fire('featureCollection-modified', {
            featureType: 'mywcom_line_of_count_section'
        });
    }
}
