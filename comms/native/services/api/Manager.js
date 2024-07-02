// Copyright: IQGeo Limited 2010-2023

import GeomUtils from '../base/GeomUtils';
import myw, { MywClass } from 'myWorld-base';

/**
 * Superclass for NM managers
 *
 * Provides helpers for geometic operations and feature manipulation
 */
/*eslint-disable no-await-in-loop*/
class Manager extends MywClass {
    static registerTriggers(NetworkView) {}

    // -----------------------------------------------------------------------
    //                                 INITIALISATION
    // -----------------------------------------------------------------------

    /**
     * Init slots of self
     *
     * VIEW is a NetworkView
     */
    constructor(nw_view, progress) {
        super();
        this.nw_view = nw_view;
        this.db_view = nw_view.db_view;
        this.progress = progress;
    }

    // -----------------------------------------------------------------------
    //                           SPECS AND CONTAINMENT
    // -----------------------------------------------------------------------

    /**
     * Set the housing of REC to HOUSING
     */
    async setHousing(rec, housing) {
        this.progress(2, 'Setting', rec, 'housing to', housing);

        rec.properties.housing = housing.getUrn();
        rec.properties.root_housing = this.rootHousingUrn(housing);

        // Get from housing, taking direction into accound
        const geom = this.derivedGeomFor(rec, housing);

        // Set it
        rec.geometry = geom;
        await this.update(rec);
    }

    /**
     * The URN of the root housing of HOUSING (an equip, route, struct, etc)
     */
    rootHousingUrn(housing) {
        if (Object.keys(housing.properties).includes('root_housing')) {
            return housing.properties.root_housing;
        }

        return housing.getUrn();
    }

    /**
     * Returns the top level container of HOUSING (which may be HOUSING itself)
     */
    rootHousing(housing) {
        if ('root_housing' in housing.properties.fields) {
            return housing._field('root_housing').rec();
        }

        return housing;
    }

    /**
     * Returns geometry REC, derived from HOUSING
     *
     * REC is a conduuit, cable segment or circuit segment.
     * HOUSING is a route, conduit or structure
     */
    derivedGeomFor(rec, housing) {
        const housing_geom = { ...housing.geometry };

        if (this.isForward(rec) == this.isForward(housing)) {
            return housing_geom;
        } else {
            return GeomUtils.reverse(housing_geom);
        }
    }

    /**
     * Returns in/out structures for REC, derived from HOUSING
     *
     * REC is a conduuit, cable segment or circuit segment.
     * HOUSING is a route or conduit
     */
    derivedPropsFor(rec, housing) {
        const derived_props = {};

        if (this.isForward(rec) == this.isForward(housing)) {
            derived_props['in_structure'] = housing.properties.in_structure;
            derived_props['out_structure'] = housing.properties.out_structure;
        } else {
            derived_props['in_structure'] = housing.properties.out_structure;
            derived_props['out_structure'] = housing.properties.in_structure;
        }

        return derived_props;
    }

    /**
     * True if REC runs in the same direction as its root housing
     *
     * REC is a conduit, cable segment, circuit segment, route, etc
     */
    isForward(rec) {
        if (Object.keys(rec.properties).includes('forward')) {
            return rec.properties.forward;
        }

        return true;
    }

    // -----------------------------------------------------------------------
    //                               FEATURE HELPERS
    // -----------------------------------------------------------------------

    /**
     * The features of type FEATURE_TYPES at COORD
     */
    async featuresAt(coord, feature_types, limit = undefined, tolerance = undefined) {
        if (tolerance == undefined) {
            tolerance = 0.00001; // TBR: in metres (workaround for Core bug 15606)
        }

        // Find features
        const geom = myw.geometry.point(coord);
        const recs = [];
        for (const feature_type of feature_types) {
            const tab = await this.db_view.table(feature_type);
            const query = tab.geomWithinDist(geom, tolerance);

            for (const rec of await query.all()) {
                recs.push(rec);
                if (limit && recs.length > limit) {
                    break;
                }
            }
        }

        return recs;
    }

    /**
     * Insert a copy of REC, overriding property PROPs
     */
    async insertCopy(rec, triggers = false, props = {}) {
        const tab = await this.db_view.table(rec.getType());

        let new_rec = this._new_detached(tab);

        // Apply properties
        // Do not copy name or circuit properties
        const skipFields = ['name', 'id', 'circuits'];
        for (const [key, value] of Object.entries(rec.properties)) {
            if (!skipFields.includes(key)) {
                new_rec.properties[key] = value;
            }
        }

        new_rec.geometry = rec.geometry; //Because geometry field is a stored field in server implementation

        if (rec.secondary_geometries)
            new_rec.secondary_geometries = { ...rec.secondary_geometries };

        //Overwrite with passed props
        //ENH: Could do this in one go
        for (const [key, value] of Object.entries(props)) {
            new_rec.properties[key] = value;
        }

        new_rec = await this.insertRecord(new_rec, triggers);

        return new_rec;
    }

    /**
     * Insert record
     * If triggers then will run pre and post insert triggers
     */
    async insertRecord(rec, triggers = false) {
        const table = await this.db_view.table(rec.getType());

        if (triggers) {
            await this.nw_view.runPreInsertTriggers(rec);
        }

        const id = await table.insert(rec);
        rec = await table.get(id);

        if (triggers) {
            await this.nw_view.runPosInsertTriggers(rec);
        }

        return rec;
    }

    /**
     * Update feature record REC in database
     */
    // ENH: Provide core protocol rec.update()
    async update(rec) {
        const tab = await this.db_view.table(rec.getType());
        return tab.update(rec.id, rec);
    }

    /**
     * Delete REC
     */
    async deleteRecord(rec) {
        this.progress(8, 'Deleting feature', rec);
        const tab = await rec.view.table(rec.getType());
        return tab.delete(rec.id);
    }

    // -----------------------------------------------------------------------
    //                                  MISC
    // -----------------------------------------------------------------------

    /**
     * Returns the configured function of EQUIP
     */
    functionOf(equip) {
        // Move to nw_view

        return this.nw_view.equips[equip.getType()]?.function;
    }

    /**
     * Update COORDS to a form suitable for creating a database linestring from
     *
     * Returns a list of coords or None
     */
    fixupLineStringCoords(coords) {
        if (!coords.length) {
            return undefined;
        }

        // Linestring coords should have at least length of 2 - so duplicate coord
        if (coords.length == 1) {
            coords = [coords[0], coords[0]];
        }

        return coords;
    }

    _new_detached(tab) {
        return {
            geometry: {},
            properties: {},
            getType: () => {
                return tab.featureName;
            }
        };
    }
}

export default Manager;
