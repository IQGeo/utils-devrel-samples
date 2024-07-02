// Copyright: IQGeo Limited 2010-2023

import Manager from './Manager';
import myw, { FilterParser } from 'myWorld-base';
import { transformTranslate, distance, pointToLineDistance } from '@turf/turf';

/**
 * Manager for maintaining equipment
 */
/*eslint-disable no-await-in-loop*/
class EquipmentManager extends Manager {
    static {
        this.prototype.units = { units: 'degrees' };
        this.prototype.equipment_offset_dis = 0.00001605; // distance between structure and new offset
        this.prototype.tolerance = 1e-6;
    }

    static registerTriggers(NetworkView) {
        NetworkView.registerTrigger('equip', 'pos_insert', this, 'posInsertTrigger');
        NetworkView.registerTrigger('equip', 'pos_update', this, 'posUpdateTrigger');
        NetworkView.registerTrigger('equip', 'pre_delete', this, 'preDeleteTrigger');
    }

    /**
     * Called after EQUIP is inserted
     */
    async posInsertTrigger(equip) {
        this.progress(2, 'Running insert trigger', equip);

        const offset = this.offsetFor(equip);
        if (offset) {
            await this.createEquipmentOffsetGeom(equip);
        }
    }

    /**
     * Called after EQUIP is updated
     *
     * ORIG_EQUIP is a pre-update clone of the equipment record
     */
    async posUpdateTrigger(equip, orig_equip) {
        this.progress(2, 'Running post-update trigger', equip);

        if (this.functionOf(equip) == 'slack') {
            await this.nw_view.cable_mgr.updateSlackSegment(equip);
        }
    }

    /**
     * Called before EQUIP is deleted
     */
    async preDeleteTrigger(equip) {
        this.progress(2, 'Running pre-delete trigger', equip);

        // Delete connections and internal segments
        await this.disconnect(equip);

        // Maintain line of count information
        await this.nw_view.loc_mgr.handleEquipmentDelete(equip);

        // Delete child equips and their connections
        const sub_equips = await this.allEquipmentIn(equip);
        for (const sub_equip of sub_equips) {
            await this.deleteEquipment(sub_equip);
        }
    }

    // -----------------------------------------------------------------------
    //                           OFFSET
    // -----------------------------------------------------------------------

    /**
     * Saves new offset in 'offset_geom'
     * @param {*} equipment
     * @returns
     */
    async createEquipmentOffsetGeom(equipment) {
        const offset_equipment = await this.newOffsetForEquipment(equipment);

        if (!equipment.secondary_geometries) equipment.secondary_geometries = {};

        equipment.secondary_geometries.offset_geom = offset_equipment;
        this.update(equipment);
        return equipment;
    }

    async newOffsetForEquipment(equipment) {
        const housing = await equipment.followRef('root_housing');
        const lines_to_avoid = await this.getCableOffsets(housing);
        const points_to_avoid = await this.getEquipmentOffsets(housing);

        let offset_bearing = 0;
        let increment = 180;
        let circuits = 1;
        let bearings = [];
        while (circuits < 4) {
            // place offset equipment at equal angles based on the number of circuits. Circuit one is in 180 deg increments, circuit 2 is 90 deg, circuit 3 is 45 deg, etc.
            if (offset_bearing == 360) {
                // starting a new circuit
                offset_bearing = 0;
                circuits += 1;
                increment = 360 / 2 ** circuits;
            }

            // check that we haven't tried to use this location in a previous circuit
            if (bearings.includes(offset_bearing) === false) {
                const offset_geom = transformTranslate(
                    equipment.geometry,
                    this.equipment_offset_dis,
                    offset_bearing,
                    this.units
                );

                // check for intersecting geometry on equipment and cable offsets
                if (
                    lines_to_avoid.every(
                        line => pointToLineDistance(offset_geom, line, this.units) > this.tolerance
                    ) &&
                    points_to_avoid.every(
                        point => distance(offset_geom, point, this.units) > this.tolerance
                    )
                ) {
                    {
                        // beyond the tolerance from existing offsets, use this geometry
                        return offset_geom;
                    }
                }
                bearings.push(offset_bearing);
            }

            offset_bearing += increment;
        }

        return null;
    }

    async getCableOffsets(housing) {
        const all_segments = await this.nw_view.cable_mgr.segmentsAt(housing);
        const coax_cables = await this.nw_view.cable_mgr.getRouteOffsets(all_segments);

        return coax_cables;
    }

    async getEquipmentOffsets(housing) {
        const all_equips = await this.equipmentOf(housing);
        // get equipment on this structure that can be offset
        const coax_equip_features = all_equips.filter(eq => this.offsetFor(eq));
        let equip_offset_geoms = [];
        for (const equip_feature of coax_equip_features) {
            const equip_offset_geom = equip_feature.secondary_geometries?.offset_geom;
            if (equip_offset_geom) {
                equip_offset_geoms.push(equip_offset_geom);
            }
        }

        return equip_offset_geoms;
    }

    /**
     * Returns whether this equipment is configured to be offset
     * @param {*} equipment
     * @returns
     */
    offsetFor(equipment) {
        const feature_type = equipment.getType();
        const offset = myw.config['mywcom.equipment'][feature_type]?.offset === true;

        return offset;
    }

    // -----------------------------------------------------------------------
    //                           CONTAINMENT
    // -----------------------------------------------------------------------

    /**
     * Move EQUIP and its children to HOUSING
     *
     * If this is to a different root housing then connections and internal segments are deleted
     */
    async moveAssembly(equip, housing) {
        this.progress(2, 'Moving assembly', equip, housing);

        const new_root_housing = this.rootHousingUrn(housing);
        const changed_root_housing = equip.root_housing != new_root_housing;

        // Move equip
        if (changed_root_housing) await this.disconnect(equip);
        this.setHousing(equip, housing);

        // Move contained equipment
        const equip_geom = equip.geometry;
        for (const sub_equip of await this.allEquipmentIn(equip)) {
            if (changed_root_housing) await this.disconnect(sub_equip);
            sub_equip.geometry = equip_geom;
            sub_equip.properties.root_housing = new_root_housing;
            await this.update(sub_equip);
        }

        return 201; //Return 'created' response code.
    }

    /**
     * Add copy of EQUIP and its children to HOUSING (recursive)
     *
     * Does not copy connections or internal segments
     */
    async copyAssembly(equip, housing) {
        this.progress(2, 'Copying assembly', equip, housing);

        const housing_geom = housing.geometry;

        const housing_urn = housing.getUrn();
        const root_housing_urn = this.rootHousingUrn(housing);

        const new_equip = await this.insertCopy(equip, false, {
            housing: housing_urn,
            root_housing: root_housing_urn,
            name: undefined
        });
        new_equip.geometry = housing_geom;
        await this.update(new_equip); //To set geom in db

        // Run pos insert trigger (to set name etc)
        await this.nw_view.runPosInsertTriggers(new_equip);

        const equips = await this.equipmentOf(equip);

        for (const child_equip of equips) {
            await this.copyAssembly(child_equip, new_equip);
        }

        return new_equip;
    }

    /**
     * Returns all equipment under HOUSING (including sub equipment)
     */
    // ENH: Possibly faster to use root_housing then filter?
    async allEquipmentIn(housing, features = undefined) {
        if (features === undefined) {
            features = [];
        }

        const equips = await this.equipmentOf(housing);

        for (const equip of equips) {
            if (!features.filter(current => current.getUrn() == equip.getUrn()).length)
                features.push(equip);
            await this.allEquipmentIn(equip, features);
        }

        return features;
    }

    /**
     * Returns first level equipment housed in REC
     */
    async equipmentOf(rec) {
        const urn = rec.getUrn();
        const equips_config = Object.keys(this.nw_view.equips);
        const equips = [];

        for (const feature_type of equips_config) {
            const equip_tab = await this.db_view.table(feature_type);
            const filter = `[housing] = '${urn}'`;
            const pred = new FilterParser(filter).parse();
            const recs = await this.nw_view.getRecs(equip_tab, pred, true);
            equips.push(...recs);
        }

        return equips;
    }

    /**
     * Delete EQUIP and its connections
     */
    async deleteEquipment(equip) {
        this.progress(2, 'Deleting', equip);
        await this.disconnect(equip);
        await this.nw_view.loc_mgr.handleEquipmentDelete(equip);
        await this.deleteRecord(equip);
    }

    /**
     * Delete connections and internal segments owned by EQUIP
     */
    async disconnect(equip) {
        // Prevent corruption of circuit paths

        const hasCircuits = await this.nw_view.circuit_mgr.equipHasCircuits(equip);
        if (hasCircuits) {
            throw new Error('equipment_has_circuit', equip);
        }

        if (this.functionOf(equip) == 'slack') {
            // If directly removing slack, remove slack segment(s), maintain connections if they exist
            await this.nw_view.cable_mgr.deleteSlackSegment(equip);
        }

        // Remove connections
        // ENH: Online code only does this if equip not slack
        await this.nw_view.connection_mgr.deleteConnections(equip);
        await this.nw_view.cable_mgr.deleteInternalSegments(equip);

        // Remove any explicit segment containment relationships
        await this.nw_view.cable_mgr.removeSegmentsFrom(equip);
    }

    // -----------------------------------------------------------------------
    //                          STRUCTURE CONTAINMENT
    // -----------------------------------------------------------------------
    // Provided for speed. Use root_housing field

    /**
     * Update location of all equipment contained within STRUCT
     */
    async updateEquipGeoms(struct) {
        const struct_urn = struct.getUrn();

        const geom = struct.geometry;

        const equips_config = this.nw_view.equips;

        // For each equipment type ..
        for (const feature_type of Object.keys(equips_config)) {
            const equip_tab = await this.db_view.table(feature_type);

            // For each equip in structure .. update position
            const filter = `[root_housing] = '${struct_urn}'`;
            const pred = new FilterParser(filter).parse();

            const equips = await equip_tab.query().filter([pred]).all();
            for (const equip of equips) {
                equip.geometry = geom;
                await this.update(equip);
            }
        }
    }

    /**
     * Deletes all equipment and connections in STRUCT
     */
    async deleteEquipmentInStructure(struct) {
        // Prevent corruption of circuit paths
        if (await this.nw_view.circuit_mgr.structHasCircuits(struct)) {
            throw new Error('structure_has_circuit', /*feature=*/ struct);
        }

        // Delete equipment and connections
        await this.nw_view.cable_mgr.deleteInternalSegments(struct, true, true);

        const conns = await this.nw_view.connection_mgr.connectionsOfAll(struct, 'root_housing');
        for (const conn of conns) {
            await this.deleteRecord(conn);
        }

        for (const equip of await this.equipsIn(struct)) {
            if (this.functionOf(equip) != 'slack') await this.deleteRecord(equip);
        }
    }

    /**
     * Returns all equipment housed in STRUCT
     */
    async equipsIn(struct, include_proposed = false) {
        const struct_urn = struct.getUrn();

        let equips = [];

        for (const feature_type in this.nw_view.equips) {
            const tab = await this.db_view.table(feature_type);
            const filter = `[root_housing] = '${struct_urn}'`;
            const pred = new FilterParser(filter).parse();
            const ft_equips = await this.nw_view.getRecs(tab, pred, include_proposed);

            equips = [...equips, ...ft_equips];
        }

        return equips;
    }

    /**
     *
     * Returns all slack housed in STRUCT
     */
    async slacksIn(struct) {
        const slack = [];
        for (const equip of await this.equipsIn(struct)) {
            if (this.functionOf(equip) == 'slack') slack.push(equip);
        }

        return slack;
    }
}

export default EquipmentManager;
