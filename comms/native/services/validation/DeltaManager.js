// Copyright: IQGeo Limited 2010-2023

import myw, { MywClass, MywInternalError, FilterParser } from 'myWorld-base';
import { Conflict, FeatureChange } from 'myWorld-native-services';
import NetworkView from '../api/NetworkView';
import DataValidator from './DataValidator';

/**
 * Engine for managing design data
 */
/*eslint-disable no-await-in-loop*/
class DeltaManager extends MywClass {
    /**
     * Init slots of self
     *
     * DB_VIEW is a FeatureView
     */
    constructor(db_view, progress) {
        super();
        if (!db_view.delta) {
            throw new MywInternalError('View not delta', db_view); // TODO: Class not defined
        }

        this.db_view = db_view;
        this.progress = progress;

        this.nw_view = new NetworkView(this.db_view, this.progress);
        // this.conflict_fixer = new ConflictResolver(this.nw_view,this.progress)  // Not supported in native
        // this.data_fixer     = new DataFixer(this.nw_view,this.progress)        // Not supported in native
    }

    // ------------------------------------------------------------------------------
    //                                   CHECKING
    // ------------------------------------------------------------------------------

    /**
     * The feature changes made in self's delta
     *
     * Returns an ordered list of FeatureChange objects
     */
    async changes(
        feature_types = undefined,
        change_types = undefined,
        bounds = undefined,
        limit = undefined
    ) {
        if (change_types === undefined) {
            change_types = ['insert', 'update', 'delete'];
        }

        const changes = [];
        const delta_recs = await this.deltaRecs(feature_types, change_types, bounds);
        let cnt = 0;
        for (const delta_rec of delta_recs) {
            if (limit && cnt >= limit) break;
            cnt += 1;

            let base_rec = undefined;
            if (delta_rec.myw.change_type == 'update') {
                const table = await this.db_view.table(delta_rec.getType());
                base_rec = await table._baseRec(delta_rec.id);
                base_rec.view = this.db_view;
            }

            const change = new FeatureChange(delta_rec.myw.change_type, delta_rec, base_rec);
            changes.push(change);
        }

        return changes;
    }

    /**
     * Find conflicts in current delta
     *
     * Optional BOUNDS is a polygon. Optional CATEGORIES is a list of names
     *
     * Returns a list of lists of MywConflict objects, keyed by feature type
     */
    async conflicts(bounds = undefined, categories = undefined) {
        const feature_types = await this.orderedFeatureTypes(categories);
        const change_types = ['insert', 'update', 'delete'];

        // Find conflicts
        const conflicts = {};

        for (const feature_type of feature_types) {
            const table = await this.db_view.table(feature_type);

            // Find changed records
            const delta_recs = await this.deltaRecs([feature_type], change_types, bounds);

            // Find conflicts
            const ft_conflicts = {};
            for (const delta_rec of delta_recs) {
                const conflict = await this.conflictFor(table, delta_rec);

                if (conflict) {
                    delta_rec.view = this.db_view;
                    ft_conflicts[delta_rec.id] = conflict;
                }
            }

            // Add to result
            if (Object.keys(ft_conflicts).length) {
                conflicts[feature_type] = ft_conflicts;
            }
        }

        return conflicts;
    }

    /**
     * Check integrity of objects in self's delta
     *
     * Returns a list of IntegrityError objects
     *
     * MAX_ERRORS - if specified will stop after that many errors found
     */
    async validate(bounds = undefined, categories = undefined, max_errors = undefined) {
        this.progress(6, 'Checking', this.db_view);
        const validator = new DataValidator(this.db_view, undefined, this.progress);

        const feature_types = await this.orderedFeatureTypes(categories);

        const delta_recs = await this.deltaRecs(feature_types, undefined, bounds);
        for (const rec of delta_recs) {
            await validator.check(rec);

            if (max_errors && Object.keys(validator.errors).length >= max_errors) {
                break;
            }
        }

        return validator.errors;
    }

    // ------------------------------------------------------------------------------
    //                                  MERGING
    // ------------------------------------------------------------------------------
    // Not supported on native
    // /**
    //  * Auto-resolve conflicts and integrity errors in self's delta
    //  *
    //  * Returns a list of FeatureChange objects
    //  */
    // merge() {
    //     this.progress(2, 'Merging', this.db_view);

    //     changes = {};
    //     this.fixConflicts(changes);
    //     this.fixGeoms(changes);

    //     return changes.values();
    // },

    // /**
    //  * Auto-resolve conflicts in self's delta
    //  *
    //  * Updates CHANGES (a set of FeatureChange objects)
    //  */
    // fixConflicts(changes) {
    //     this.progress('Fixing conflicts in', this.db_view);

    //     for (const [feature_type, conflicts] of this.conflicts().items()) {
    //         for (const [id, conflict] of conflicts.items()) {
    //             this.fixConflict(conflict, changes);
    //         }
    //     }
    // },

    // /**
    //  * Auto-resolve CONFLICT (if possible)
    //  *
    //  * Returns a FeatureChange (None if no change)
    //  */
    // fixConflict(conflict, changes) {
    //     conflict_type = conflict.master_change + '/' + conflict.delta_rec.myw_change_type;

    //     // Say what we are doing
    //     this.progress(6, conflict.delta_rec, 'Attempting to auto-resolve', conflict_type);

    //     // Resolve
    //     if (conflict_type == 'update/update')
    //         return this.fixUpdateUpdateConflict(conflict, changes);
    //     if (conflict_type == 'update/delete')
    //         return this.fixUpdateDeleteConflict(conflict, changes);
    //     return undefined;
    // },

    /**
     * Return delta_rec to master state
     */
    // ENH: Don't support this in Native
    async revert(delta_rec) {
        // return this.conflict_fixer.revert(delta_rec);

        const table = await this.db_view.table(delta_rec.getType());

        if (!table.deltaTable) return;
        await table.deltaTable.delete(delta_rec.id);

        const base_rec = await table._baseRec(delta_rec.id);
        if (base_rec) await table.baseTable.delete(base_rec.id);
    }

    /**
     * No-op on native
     * @param {MywFeature} delta_rec
     * @returns
     */
    async rebase(delta_rec) {
        return delta_rec;
    }

    // ------------------------------------------------------------------------------
    //                                  HELPERS
    // ------------------------------------------------------------------------------

    /**
     * The delta records of current view
     */
    // ENH: Replace by protocol on MywVersionedFeatureView
    // ENH@ Return detached records?
    async deltaRecs(feature_types = undefined, change_types = undefined, bounds = undefined) {
        if (change_types === undefined) {
            change_types = ['insert', 'update'];
        }

        // Deal with defaults
        if (feature_types === undefined) {
            feature_types = await this.orderedFeatureTypes();
        }

        // For each feature type ..
        const recs = [];
        for (const feature_type of feature_types) {
            const tab = await this.db_view.table(feature_type);
            await tab.initialized;
            // Build query (ordering to get inserts first)
            let query = tab._delta_recs.orderBy('id', false);
            if (change_types) {
                const change_type_strs = change_types.map(ct => `'${ct}'`);
                const filter = `[myw_change_type] in (${change_type_strs.join(',')})`;
                const pred = new FilterParser(filter).parse();
                query = query.filter([pred]);
            }

            if (bounds) {
                const primary_geom_name = tab.descriptor?.primary_geom_name;

                if (primary_geom_name) {
                    query = query.whereIntersects(primary_geom_name, bounds);
                }
            }

            // Yield records
            const ft_recs = await query.all();
            for (const rec of ft_recs) {
                recs.push(rec);
            }
        }

        return recs;
    }

    /**
     * Versioned feature types, in 'top down' order
     *
     * If optional CATEGORIES is provided, return only types from those categories
     */
    async orderedFeatureTypes(categories = undefined) {
        // ENH: Move to network view

        // Mapping from category name -> nw_view property
        const name_mappings = { structures: 'structs', equipment: 'equips' };

        // Case: Categories
        // ENH: Filter result instead
        if (categories) {
            let feature_types = [];
            for (const category of categories) {
                const prop_name = name_mappings[category] || category;
                let cat_fts = await this.nw_view[prop_name];
                if (!cat_fts.length) cat_fts = Object.keys(cat_fts); // ENH: Fix network_view categories to all be arrays
                feature_types = [...feature_types, ...cat_fts];
            }

            return feature_types;
        }

        // Case: All
        const all_feature_types = await this.getVersionedFeatureTypes();

        const user_feature_types = [
            ...Object.keys(this.nw_view.structs),
            ...Object.keys(this.nw_view.routes),
            ...Object.keys(this.nw_view.equips),
            ...Object.keys(this.nw_view.conduits),
            ...Object.keys(this.nw_view.cables),
            ...Object.keys(this.nw_view.connections),
            ...Object.keys(this.nw_view.circuits),
            ...Object.values(this.nw_view.line_of_counts)
        ];

        const int_feature_types = [
            ...Object.values(this.nw_view.conduit_runs),
            ...Object.keys(this.nw_view.segments)
        ];

        const custom_feature_types = [
            ...new Set(
                all_feature_types.filter(
                    feature =>
                        !user_feature_types.includes(feature) &&
                        !int_feature_types.includes(feature)
                )
            )
        ].sort();

        return [...custom_feature_types, ...user_feature_types, ...int_feature_types];
    }

    /**
     * Conflict info for delta_rec (if any)
     *
     * Returns a Conflict (or None)
     */
    async conflictFor(table, delta_rec) {
        // ENH: Remove need for custom conflict class and get rid of this

        const conflict = await table.conflictFor(delta_rec);

        if (!conflict) {
            return undefined;
        }

        return new Conflict(
            conflict.master_change,
            conflict.delta_rec,
            conflict.master_rec,
            conflict.base_rec
        );
    }

    /**
     * Returns geometry bounds for changes in delta
     * @returns Object with geometry property is bounds geometry or None
     */
    async bounds() {
        const delta = this.db_view.delta;
        const buffer_dist = 10;

        // Build query SQL
        const indexTables = [
            'myw$delta_geo_world_point',
            'myw$delta_geo_world_linestring',
            'myw$delta_geo_world_polygon'
        ];
        const indexSql = indexTables.map(
            table => ` select the_geom from ${table} where delta = '${delta}' `
        );
        const unionSql = indexSql.join(' UNION ');
        const aggSql = `AsGeoJSON(ST_Collect(the_geom))`;
        const sql = `select ${aggSql} as the_geom from ( ${unionSql} )`;

        const result = await this.db_view.db.runSql(sql);
        const geom = JSON.parse(result[0]['the_geom']);

        if (!geom) return { geometry: null };

        // Use turf to create the correct buffer. This can probably be done in SQL but more complex.
        /*eslint-disable no-undef*/
        await myw.geometry.init();
        const feature = { type: 'Feature', properties: {}, geometry: geom };
        const convex = turf.convex(feature);
        const buffer = turf.buffer(convex, buffer_dist, { units: 'meters' });
        /*eslint-enable no-undef*/

        return { geometry: buffer.geometry };
    }

    /**
     * TBR: PLAT-8203 When platform provides this method on the native server api
     * This is a copy of a method on NetworkView which is a copy of a method on WorkflowDeltaController
     * Gets all feature_types configured as versioned from the myWorld datasource=
     * @returns {Promise<Array>} an array of feature types
     */
    async getVersionedFeatureTypes() {
        const records = await this.db_view.db
            .cachedTable('dd_feature')
            .where({ datasource_name: 'myworld', versioned: true })
            .all();

        return records.map(rec => rec.feature_name);
    }
}

export default DeltaManager;
