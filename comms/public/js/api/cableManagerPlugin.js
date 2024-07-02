// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import { arrayEqual } from '../base/collectionUtils';
import { isEmpty, has, find } from 'underscore';
import { decomposeUrn } from '../base/urnUtils';
import { distance, along, length, lineSplit, lineString } from '@turf/turf';

export default class CableManagerPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'CableManager';
    }

    /**
     * @class Provides API for routing and maintaining cables
     *
     * Called from StructureManager and ConduitManager. Provides functions for
     * moving and splitting cables. Also for finding cable routes
     *
     * @extends {Plugin}
     */
    /*eslint-disable no-await-in-loop*/
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');

        this.cableConfig = myw.config['mywcom.cables'];

        this.conduitManager = this.app.plugins.conduitManager;
        this.cableFeatureTypes = Object.keys(this.cableConfig);

        this.showStructConduits = this.options.showStructConduits;

        const lengthConfig = myw.config['core.units'].length;
        this.lengthUnitScale = new myw.UnitScale(lengthConfig);

        this.networkTypes = myw.config['mywcom.network_types'];

        this.modelFeatureTypes = Object.values(this.networkTypes)
            .map(network => [network.segment_type, network.slack_type, network.connection_type])
            .flat();

        this.app.ready.then(async () => {
            this.listenTo(this.app.plugins.connectionManager, 'connected', async event => {
                await this.handleConnect(event);
            });
        });

        // same values as in cableManager.py
        this.units = { units: 'degrees' };
        this.equipment_offset_dis = 0.00001605;
    }

    // -----------------------------------------------------------------------
    //                             CONNECTIONS
    // -----------------------------------------------------------------------

    /**
     * True if changing the count for 'cable' would not invalidate any connections
     * @param {MywFeature} cable
     * @param {integer} count
     * @return {boolean}
     */
    async highestUsedPinOn(cable, count) {
        return this.ds.comms.cableHighestUsedPin(cable);
    }

    /**
     * Connection records for cable
     * @param {MywFeature} cable
     * @param {bool} splice
     * @param {bool} sorted
     * @return [{MywFeature}]  List of connection records
     */
    async connectionsFor(cable, splice = undefined, sorted = false) {
        return this.ds.comms.connectionsForCable(cable, splice, sorted);
    }

    // -----------------------------------------------------------------------
    //                             INTERNAL SEGMENTS
    // -----------------------------------------------------------------------

    /**
     * Returns internal segments housed within a feature
     *
     * @param {feature} feature that houses the internal segments
     * @param {boolean} is housing the root housing or not
     */
    async internalSegments(housingFeature, root = false) {
        const housingFeatureUrn = housingFeature.getUrn();

        // Figure out if looking for root housing or housing
        const filterFieldName = root ? 'root_housing' : 'housing';

        const queryParams = {
            limit: null,
            clauses: [{ fieldName: filterFieldName, operator: '=', value: housingFeatureUrn }]
        };

        const requests = this.allSegmentTypes().map(async featureType => {
            const data = await this.ds.getFeatures(featureType, queryParams);
            return data.features;
        });

        const results = await Promise.all(requests);
        const features = {
            features: results.flat()
        };
        return features;
    }

    /**
     * Create detached segment that is internal to a structure
     *
     * @param {feature} structure
     * @param {feature} owning cable
     * @param {string} URN of housing (or transaction place holder)
     * @param {float} optional length
     */
    async createDetachedInternalSeg(struct, cable, housingUrn, length = null) {
        const structUrn = struct.getUrn();

        const segType = this.segmentTypeForCable(cable);
        const detSeg = await this.ds.createDetachedFeature(segType);

        detSeg.properties.in_structure = structUrn;
        detSeg.properties.out_structure = structUrn;
        detSeg.properties.root_housing = structUrn;
        detSeg.properties.cable = cable.getUrn();
        detSeg.properties.housing = housingUrn;
        detSeg.properties.directed = cable.properties.directed;
        detSeg.properties.length = length;

        detSeg.geometry = {
            type: 'LineString',
            coordinates: [struct.geometry.coordinates, struct.geometry.coordinates]
        };

        return detSeg;
    }

    // -----------------------------------------------------------------------
    //                             SLACK
    // -----------------------------------------------------------------------

    /**
     * Create Detached Slack Feature
     *
     * @param {feature} cable feature
     * @param {feature} housing feature
     * @param {string} tech, defaults to fiber
     */

    async createDetachedSlack(cableFeature, housingFeature) {
        const featureType = this.slackTypeForCable(cableFeature);

        // Firstly create the new slack feature
        let newSlack = await this.ds.createDetachedFeature(featureType);
        newSlack.properties.housing = housingFeature.getUrn();
        newSlack.properties.cable = cableFeature.getUrn();
        newSlack.properties.root_housing = this.rootHousingUrnOf(housingFeature);

        newSlack.geometry = housingFeature.geometry;

        return newSlack;
    }

    /**
     * Split existing slack into two, dividing length value
     *
     * @param {feature} slack feature to split
     * @return [features] the updated original slack and the new split piece
     */
    async splitSlack(slack, length) {
        const splitLength = length;
        const featureType = slack.getType();
        const result = await this.ds.comms.splitSlack(featureType, slack.getId(), splitLength);

        this.app.fire('featureCollection-modified', { featureType });

        return [result.oldSlack, result.newSlack];
    }

    /**
     * Create detatched slack at side of existing segment
     *
     * @param {feature} existing segment
     * @param {feature} structure that will house the slack
     * @param {boolean} true if slack created before existing segment, otherwise false
     * @return {feature} detached slack feature
     */
    async createDetSlackAtSide(seg, struct, side) {
        const cable = await seg.followReference('cable');
        const detSlack = await this.createDetachedSlack(cable, struct);
        const slackDetails = { segUrn: seg.getUrn(), side };
        // used in slackEditor to run addSlack()
        detSlack.slackDetails = slackDetails;

        return detSlack;
    }

    /**
     * Creates Slack at side of SEG inside of STRUCT
     * Returns ID of inserted slack
     *
     * @param {string} featureType
     * @param {GeoJSON Feature} detSlack
     * @param {string} segUrn semgent URN
     * @param {boolean} before if slack created before existing segment, otherwise false
     */
    async addSlack(featureType, detSlack, segUrn, side) {
        return this.ds.comms.addSlack(featureType, detSlack, segUrn, side);
    }

    /**
     * Move connections on from oldSeg to newSeg on side of connection
     * Returns array of updated features to use in a transaction
     *
     * @param {string} oldSeg urn
     * @param {string} newSeg urn
     * @param {string} side
     * ENH: Move to connectionManagerPlugin
     */
    async transferConnections(oldSeg, newSeg, side) {
        const conns = await this.connectionsOf(oldSeg);
        const updatedConns = [];
        conns.forEach(conn => {
            if (conn.properties.in_side == side && conn.properties.in_object == oldSeg) {
                conn.properties.in_object = newSeg;
                updatedConns.push(conn);
            }
            if (conn.properties.out_side == side && conn.properties.out_object == oldSeg) {
                conn.properties.out_object = newSeg;
                updatedConns.push(conn);
            }
        });

        return updatedConns;
    }

    /**
     * Returns query yielding connection records relating to FEATURE
     *
     * @param {MywFeature} feature
     * @param {string} housing_field
     * @param {*} splices can be used to limit records returned
     * ENH: move to ConnectionManagerPlugin
     */
    async connectionsOf(featureUrn, housing_field = 'housing', splices = undefined) {
        // ENH: Remove hardcoded feature
        const connTable = 'mywcom_fiber_connection';

        let filter = `[in_object] = '${featureUrn}' | [out_object] = '${featureUrn}' | [${housing_field}] = '${featureUrn}'`;
        if (splices) {
            filter += ` | [splice] = '${splices}'`;
        }

        return this.ds.getFeatures(connTable, { filter });
    }

    // -----------------------------------------------------------------------
    //                            SEGMENT CONTAINMENT
    // -----------------------------------------------------------------------

    /**
     * URN of equipment in which 'side' of 'seg' is housed (if any)
     */
    async segmentContainment(seg, side) {
        const equipField = side + '_equipment';
        return seg.properties[equipField];
    }

    /**
     * Mark 'side' of 'seg' as being contained in 'equip' (which can be null)
     */
    // ENH: Use transaction
    async setSegmentContainment(seg, side, equip) {
        const segs = [];

        // Set on segment
        const updatedSeg = await this._setSegmentContainment(seg, side, equip);
        segs.push(updatedSeg);

        // Set on adjacent segment
        if (side == 'in') {
            const prevSeg = await seg.followReference('in_segment');
            if (prevSeg) {
                const updatedSeg = await this._setSegmentContainment(prevSeg, 'out', equip);
                segs.push(updatedSeg);
            }
        } else {
            const nextSeg = await seg.followReference('out_segment');
            if (nextSeg) {
                const updatedSeg = await this._setSegmentContainment(nextSeg, 'in', equip);
                segs.push(updatedSeg);
            }
        }

        this.trigger('segment_containment', { segments: segs });
    }

    /**
     * Mark 'side' of 'seg' as being contained in 'equip' (which can be null)
     */
    async _setSegmentContainment(seg, side, equip) {
        const equipField = side + '_equipment';

        if (equip) {
            seg.properties[equipField] = equip.getUrn();
        } else {
            seg.properties[equipField] = null;
        }

        return this.ds.updateFeature(seg);
    }

    // -----------------------------------------------------------------------
    //                                TICK MARKS
    // -----------------------------------------------------------------------
    /**
     * Set tick mark of seg and of directly up/downstream sef to tickMark
     * Trace up and downstream to update measured length of segs (taking in to account route junctions)
     *
     * @param {MywFeature} seg cable_segment
     * @param {Integer} tickMark new tick mark
     * @param {string} field 'in_tick' or 'out_tick'
     * @param {Float} spacing distance (in m) between tick marks
     * @param {string} unit eg m or ft
     */
    async setTickMark(seg, tickMark, field, spacing, unit) {
        const trans = new myw.Transaction(this.app.database);

        if (tickMark == undefined) {
            await this._setTickMarkNull(trans, seg, field);
            return;
        }

        let inTick;
        let outTick;
        if (field == 'in_tick') {
            inTick = await this.setInTickMark(trans, seg, tickMark, spacing, unit);
            const nextSeg = await seg.followReference('in_segment');
            if (nextSeg)
                outTick = await this.setOutTickMark(trans, nextSeg, tickMark, spacing, unit);
        }

        if (field == 'out_tick') {
            outTick = await this.setOutTickMark(trans, seg, tickMark, spacing, unit);
            const nextSeg = await seg.followReference('out_segment');
            if (nextSeg) inTick = await this.setInTickMark(trans, nextSeg, tickMark, spacing, unit);
        }

        await this._assertEndSegValid(seg, tickMark, inTick, outTick);
        this._assertTickMarkValid(tickMark, inTick, outTick);

        await this.ds.runTransaction(trans);
    }

    /**
     * Set in tick of seg and adjust measured length of all downstream segs to next tick
     *
     * @param {Transaction} trans
     * @param {MywFeature} seg
     * @param {Integer} tickMark
     * @param {Float} spacing
     * @param {string} unit
     * @returns {Intger} downstream tick
     */
    async setInTickMark(trans, seg, tickMark, spacing, unit) {
        seg.properties.in_tick = tickMark;
        trans.addUpdate(seg);

        let [segs, tick] = await this.findDownstreamSegsToTick(seg);

        // No next tick - cannot set measured length
        if (tick == undefined) return;

        // No downstream segs... set measured length of seg
        if (!segs.length) {
            segs = [seg];
        }

        const tickDist = this.computeTickDist(seg.properties.in_tick, tick, spacing, unit);

        await this.adjustMeasuredLengths(trans, segs, tickDist);

        return tick;
    }

    /**
     * Finds all segments downstream from seg to next tick
     * returns:
     *      segs,
     *      tick - tickMark at end of last segment (if any)
     * @param {MywFeature} seg
     * @returns {Array<MywFeature>,tickMark>}
     */
    async findDownstreamSegsToTick(seg) {
        // Find downstream seg with tick mark
        let downSeg = seg;
        const segs = [seg];
        while (downSeg) {
            if (this._segHasTick(downSeg, 'out_tick')) return [segs, downSeg.properties.out_tick];
            downSeg = await downSeg.followReference('out_segment');
            if (this._segHasTick(downSeg, 'in_tick')) {
                return [segs, downSeg.properties.in_tick];
            }
            segs.push(downSeg);
        }

        return [[], null];
    }

    /**
     * Set out tick of seg and adjust all tick marks of upstream seg to next tick mark
     * @param {Transaction} trans
     * @param {MywFeature} seg
     * @param {Integer} tickMark
     * @param {Float} spacing
     * @param {string} unit
     * @returns {Intger} upstream tick
     */
    async setOutTickMark(trans, seg, tickMark, spacing, unit) {
        seg.properties.out_tick = tickMark;
        trans.addUpdate(seg);

        let [segs, tick] = await this.findUpstreamSegsToTick(seg);

        // No next tick - cannot calculate measured length
        if (tick == undefined) return;

        // No upstream segs... set measured length of seg
        if (!segs.length) {
            segs = [seg];
        }

        const tickDist = this.computeTickDist(seg.properties.out_tick, tick, spacing, unit);

        await this.adjustMeasuredLengths(trans, segs, tickDist);

        return tick;
    }

    /**
     * Finds all segments upstream from seg to next tick
     * returns:
     *      segs,
     *      tick - tickMark at end of last segment (if any)
     * @param {MywFeature} seg
     * @returns {Array<MywFeature>,tickMark>}
     */
    async findUpstreamSegsToTick(seg) {
        // Find downstream seg with tick mark
        let upSeg = seg;
        const segs = [seg];
        while (upSeg) {
            if (this._segHasTick(upSeg, 'in_tick')) return [segs, upSeg.properties.in_tick];
            upSeg = await upSeg.followReference('in_segment');
            if (this._segHasTick(upSeg, 'out_tick')) {
                return [segs, upSeg.properties.out_tick];
            }
            segs.push(upSeg);
        }

        return [[], null];
    }

    /**
     * Set 'field' of seg to null. Finds next seg and sets its corresponding tick to null
     * @param {Transaction} trans
     * @param {MywFeature} seg
     * @param {String} field 'in_tick' or 'out_tick'
     */
    async _setTickMarkNull(trans, seg, field) {
        seg.properties[field] = null;

        // Find next seg and set its corresponding tick field to null
        let nextSeg;
        if (field == 'in_tick') {
            nextSeg = await seg.followReference('in_segment');
            if (nextSeg) nextSeg.properties.out_tick = null;
        }

        if (field == 'out_tick') {
            nextSeg = await seg.followReference('out_segment');
            if (nextSeg) nextSeg.properties.in_tick = null;
        }

        // Update segs
        trans.addUpdate(seg);
        if (nextSeg) trans.addUpdate(nextSeg);
        await this.ds.runTransaction(trans);
    }

    /**
     * Calcualte distance in meters between segTick and tick
     * @param {Integer} segTick tickMark on segment
     * @param {Integer} tick next tickMark
     * @param {Float} spacing spacing between tickMarks
     * @param {string} unit eg 'm' or 'ft'
     * @returns
     */
    computeTickDist(segTick, tick, spacing, unit) {
        const tickDist =
            Math.abs(segTick - tick) * this.lengthUnitScale.convert(spacing, 'm', unit); // convert spacing from (internal unit) meters to tick unit
        return this.lengthUnitScale.convert(tickDist, unit, 'm');
    }

    /**
     * Adjusts measured lengths of segs based on tickDist
     *
     * @param {Transaction} trans
     * @param {Array<MywFeature>} segs
     * @param {Float} tickDist in meters
     */
    async adjustMeasuredLengths(trans, segs, tickDist) {
        // Get total calulated length of segs
        let calcDist = 0;
        for (const seg of segs) {
            calcDist += this.getLength(seg);
        }

        // Adjust measured lengths to match ticks
        const factor = tickDist / calcDist;
        for (const seg of segs) {
            seg.properties.length = factor * this.getLength(seg);
            trans.addUpdate(seg);
        }
    }

    /**
     * Validates end segment
     * Finds next tick, uses tick to check tickMark is valid
     *
     * @param {MywFeature} seg
     * @param {Integer} tickMark
     * @param {Integer} inTick
     * @param {Integer} outTick
     */
    async _assertEndSegValid(seg, tickMark, inTick, outTick) {
        if (inTick && outTick) return;

        // Must be end seg of a cable
        if (!inTick && !outTick) {
            return;
        } else if (!inTick && outTick) {
            const nextSeg = await seg.followReference('in_segment');
            const upstreamTickArray = await this.findUpstreamSegsToTick(nextSeg);
            const inTick = upstreamTickArray[1];
            this._assertTickMarkValid(outTick, tickMark, inTick);
        } else if (!outTick && inTick) {
            const nextSeg = await seg.followReference('out_segment');
            const downstreamTickArray = await this.findDownstreamSegsToTick(nextSeg);
            const outTick = downstreamTickArray[1];
            this._assertTickMarkValid(inTick, tickMark, outTick);
        }
    }

    /**
     * Throw error if 'tickMark' overlaps next tick mark
     *
     * @param {Integer} tickMark
     * @param {Integer} inTick
     * @param {Integer} outTick
     */
    _assertTickMarkValid(tickMark, inTick, outTick) {
        if (inTick == undefined || outTick == undefined) return;

        let ticks = [inTick, tickMark, outTick];
        ticks = ticks.filter(tick => tick != undefined);
        const sorted_ticks = [...ticks].sort((a, b) => a - b);

        // Check if ticks are in the same order - if not throw error
        if (!arrayEqual(sorted_ticks, ticks) && !arrayEqual(sorted_ticks, [...ticks].reverse())) {
            this._throwError(); //ENH: Throw which tick mark overlaps
        }
    }

    /**
     * Iterates over an array of cables and routes the cables using the given structures.
     * Once the cables are routed, they are matched with the correct housing and updated.
     *
     * @param {Array<GeoJSON>} cablesJson Array of cable data.
     * @param {Array<MywFeature>} structures Array of structure features.
     * @param {Array<MywFeature>} parentFeatures Array of features that the created cable segments will be housed in.
     *
     * @returns {Array<MywFeature>} Created cables features. (Not the cable segments)
     */
    async routeCables(cablesJson, structures, parentFeatures) {
        if (isEmpty(cablesJson) || isEmpty(structures)) {
            return [];
        }

        // Transaction used to update all cable segment housings for all the cables created.
        const segmentUpdateTransaction = this.ds.transaction();

        const createdCables = await Promise.all(
            cablesJson.map(async cableJson => {
                // We only need to include the structures. The routing on the server will take care of creating the segments.
                cableJson.geometry = {
                    type: 'LineString',
                    coordinates: structures.map(structure => structure.geometry.coordinates)
                };

                const transaction = this.ds.transaction();
                const { operation } = transaction.addInsert(cableJson.feature_type, cableJson);
                const response = await this.ds.comms.runTransaction(transaction);
                const cable = await this.ds.getFeature(
                    cableJson.feature_type,
                    response.ids[operation]
                );

                // If housing is defined, we'll need to update the cable segments.
                if (parentFeatures) {
                    const cableSegments = await cable.followRelationship('cable_segments');

                    // We need to update the housing.
                    cableSegments.forEach(cableSegment => {
                        // Find the parent conduit
                        const parentFeature = find(parentFeatures, parentFeature => {
                            return (
                                parentFeature.properties.root_housing ==
                                cableSegment.properties.root_housing
                            );
                        });
                        // Create an update transaction to associate the correct housing.
                        cableSegment.properties.housing = parentFeature.getUrn();
                        segmentUpdateTransaction.addUpdate(cableSegment);
                    });
                }

                return cable;
            })
        );

        // Update cable segment housings.
        await this.ds.comms.runTransaction(segmentUpdateTransaction);

        return createdCables;
    }

    /**
     * Throw 'overlapping_tick' error
     */
    _throwError() {
        const error = new Error('overlapping_tick_mark');
        throw error;
    }

    /**
     *  Check seg has tick
     *
     * @param {MywFeature} seg
     * @param {string} field in_tick or out_tick
     * @returns {boolean}
     */
    _segHasTick(seg, field) {
        if (!seg) return false;

        if (seg.properties[field] || seg.properties[field] == 0) return true;

        return false;
    }

    // -----------------------------------------------------------------------
    //                                CABLE CUTTING
    // -----------------------------------------------------------------------

    async cutCableAt(struct, segment, forward, spliceHousing) {
        const result = await this.ds.comms.cutCableAt(struct, segment, forward, spliceHousing);
        this.app.fire('cut-cable');
        return result;
    }

    // -----------------------------------------------------------------------
    //                                MISC
    // -----------------------------------------------------------------------

    /**
     * Returns true if a feature is a cable
     *
     * @param {feature} feature to check
     */
    isCable(feature) {
        return feature && has(this.cableConfig, feature.getType());
    }

    /**
     * Returns true if all of a cable's segments are internal
     * @param {MywFeature} cable feature
     */
    async isInternal(cable) {
        const filter = `[cable] = '${cable.getUrn()}'`;
        const segType = this.segmentTypeForCable(cable);
        const segs = await this.ds.getFeatures(segType, { filter });
        let internal = true;

        // detached cable (not internal)
        if (segs.length == 0) internal = false;

        for (const seg of segs) {
            if (seg.properties.in_structure != seg.properties.out_structure) {
                internal = false;
                break;
            }
        }
        return internal;
    }

    fireFeatureEvents(aspect) {
        this.cableFeatureTypes.forEach(cableFeatureType => {
            this.app.fire('featureCollection-modified', { featureType: cableFeatureType });
        });

        this.modelFeatureTypes.forEach(modelFeatureType => {
            this.app.fire('featureCollection-modified', { featureType: modelFeatureType });
        });
    }

    /**
     * The URN of the root housing of 'housing'
     * @param {RouteMixin,Conduit} housing
     */
    rootHousingUrnOf(housing) {
        if (housing.featureDD.fields['root_housing']) return housing.properties.root_housing;
        return housing.getUrn();
    }

    /**
     * Returns geo length of linestring feature
     */
    getLength(feature) {
        return feature.geometry.length();
    }

    /**
     * Return segment feature type for cable
     *
     * @param {MywFeature} cable
     * @returns
     */
    segmentTypeForCable(cable) {
        const tech = this.cableConfig[cable.getType()].tech;
        return this.networkTypes[tech].segment_type;
    }

    /**
     * Return slack feature type for cable
     * @param {MywFeature} cable
     * @returns
     */
    slackTypeForCable(cable) {
        const tech = this.cableConfig[cable.getType()].tech;
        return this.networkTypes[tech].slack_type;
    }

    /**
     * Return slack feature type for segment
     * @param {MywFeature} segment
     * @returns
     */
    slackTypeForSegment(segment) {
        for (const network of Object.values(this.networkTypes)) {
            if (network.segment_type == segment.getType()) return network.slack_type;
        }
    }

    /**
     * Determines if URN is for a segment feature
     *
     * @param {String} urn
     * @returns
     */
    isSegment(urn) {
        const urnParts = decomposeUrn(urn);
        return CableManagerPlugin.segmentTypes().includes(urnParts.typeInDs);
    }

    /**
     * Returns segment feature types for all technology types from configuration
     *
     * @returns {Array<String>} List of segment features types.
     */
    static segmentTypes() {
        return Object.values(myw.config['mywcom.network_types']).map(type => type.segment_type);
    }

    /**
     * Returns connection feature types for all technology types from configuration
     *
     * @returns {Array<String>} List of connection feature types.
     */
    static connectionTypes() {
        return Object.values(myw.config['mywcom.network_types']).map(type => type.connection_type);
    }

    /**
     * Returns slack feature types for all technology types from configuration.
     *
     * @returns {Array<String>} List of slack feature types.
     */
    static slackTypes() {
        return Object.values(myw.config['mywcom.network_types']).map(type => type.slack_type);
    }

    /**
     * Returns pin count for a feature and on side if specified and appropriate
     *
     * @param {MywFeature} feature
     * @param {String} side
     * @returns {Integer}
     */
    async pinCountFor(feature, side = undefined) {
        const feature_type = feature.getType();

        for (const tech in this.networkTypes) {
            if (this.networkTypes[tech].segment_type == feature_type) {
                const cable = await feature.followReference('cable');
                const field_name = this.networkTypes[tech].cable_n_pins_field;
                return cable.properties[field_name];
            }
        }

        for (const tech in this.networkTypes) {
            const field_name = this.networkTypes[tech].equip_n_pins_field;
            if (field_name in feature.properties) return feature.properties[field_name];
            if (side) {
                const field_name = this.networkTypes[tech][`equip_n_${side}_pins_field`];
                if (field_name in feature.properties) return feature.properties[field_name];
            }
        }
    }

    /**
     * Shortens the cable and moves the endpoint to the equipment offset geometry
     *
     * @param {*} connRec
     * @returns cable
     */
    async moveCableOnConnect(connRec) {
        const inCoaxCableBool = connRec.properties.in_object.startsWith('mywcom_coax_segment');
        const outCoaxCableBool = connRec.properties.out_object.startsWith('mywcom_coax_segment');

        let cableSeg;
        let equip;
        if (inCoaxCableBool) {
            cableSeg = await this.ds.getFeatureByUrn(connRec.properties.in_object);
            equip = await this.ds.getFeatureByUrn(connRec.properties.out_object);
        } else if (outCoaxCableBool) {
            cableSeg = await this.ds.getFeatureByUrn(connRec.properties.out_object);
            equip = await this.ds.getFeatureByUrn(connRec.properties.in_object);
        } else {
            return;
        }

        const cable = await cableSeg.followReference('cable');
        const offsetCoords = cable.secondary_geometries.offset_geom.coordinates;

        const truncDistance = 2 * this.equipment_offset_dis;
        const equipGeom = equip.secondary_geometries.offset_geom;

        //determine the correct side, then truncate and use the equip offset as the new endpoint
        const startDist = distance(equipGeom, offsetCoords[0], this.units);
        const endDist = distance(equipGeom, offsetCoords[offsetCoords.length - 1], this.units);
        let truncateCoords;
        if (startDist < endDist) {
            truncateCoords = this.truncateLine(offsetCoords, truncDistance, null);
            truncateCoords.unshift(equipGeom.coordinates);
        } else if (endDist < startDist) {
            truncateCoords = this.truncateLine(offsetCoords, null, truncDistance);
            truncateCoords.push(equipGeom.coordinates);
        } else {
            return;
        }
        cable.secondary_geometries.offset_geom = myw.geometry.lineString(truncateCoords);
        this.ds.updateFeature(cable);
        return cable;
    }

    /**
     *  Shortens the line at the either the start or end or both
     *
     * @param {*} coords
     * @param {*} startTruncDist
     * @param {*} endTruncDist
     * @returns
     */
    truncateLine(coords, startTruncDist, endTruncDist) {
        let geom = lineString(coords);

        let truncLineCoords;
        if (startTruncDist) {
            const start = along(geom, startTruncDist, this.units);
            const lines = lineSplit(geom, start);
            truncLineCoords = lines.features[1].geometry.coordinates;
            geom = lineString(truncLineCoords);
        }
        if (endTruncDist) {
            const offsetLength = length(geom, this.units);
            const end = along(geom, offsetLength - endTruncDist, this.units);
            const lines = lineSplit(geom, end);
            truncLineCoords = lines.features[0].geometry.coordinates;
        }

        return truncLineCoords;
    }

    /**
     * Handle connection event
     *
     * @param {Object} event
     */
    async handleConnect(event) {
        if (event.tech === 'coax') {
            await this.moveCableOnConnect(event.conn);

            this.fireFeatureEvents();
        }
    }
}
