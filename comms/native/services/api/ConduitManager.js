// Copyright: IQGeo Limited 2010-2023

//import OrderedDict from 'collections'
//import {MywLineString} from 'myWorld-native-services'
import geomUtils from '../base/GeomUtils';
import myw, { FilterParser } from 'myWorld-base';

//import DbConstraintError from './MywcomError'
import Manager from './Manager';

/**
 * Manager for maintaining conduits and conduit runs
 *
 * A conduit can be free standing or form part of a connected chain ('continuous').
 *
 * Continuous conduits:
 *   Fields 'in_conduit', and 'out_conduit' are required for continuous conduits only
 */
/*eslint-disable no-await-in-loop*/
class ConduitManager extends Manager {
    /**
     * Init slots of self
     */
    constructor(view, progress = undefined) {
        super(view, progress);

        // Conduit feature types configured as continuous
        const types = [];
        for (const [ft, cfg] of Object.entries(this.nw_view.conduits)) {
            if (cfg['continuous'] || false) {
                types.push(ft);
            }
        }

        this.continuous_conduit_types = types;
    }

    static registerTriggers(NetworkView) {
        NetworkView.registerTrigger('conduit', 'pre_delete', this, 'preDeleteTrigger');
    }

    /**
     * Called before CONDUIT is deleted
     */
    async preDeleteTrigger(conduit) {
        this.progress(2, 'Running delete trigger', conduit);

        // Prevent delete if any contained cables
        await this.assertNoCables(conduit);

        // Delete contained conduits
        await this.deleteConduitsIn(conduit);

        // Disconnect from chain (if in one)
        await this.disconnectConduit(conduit);
    }

    // -----------------------------------------------------------------------
    //                               SPLITTING
    // -----------------------------------------------------------------------

    /**
     * Split conduits of ROUTE at STRUCT, putting new segments in NEW_ROUTE
     *
     * Returns list of (conduit,new_conduit) pairs, keyed by urn of old conduit
     */
    async splitConduitsAt(struct, route, new_route, proportion) {
        this.progress(2, 'Splitting conduits of', route, 'at', struct, 'putting inside', new_route);

        const cnd_splits = {};

        // Split all conduits
        for (const cnd_tab_name in this.nw_view.conduits) {
            const cnd_table = await this.db_view.table(cnd_tab_name);
            const filter = `[root_housing] = '${route.getUrn()}'`;
            const pred = new FilterParser(filter).parse();
            const cnds = await cnd_table.query().filter([pred]).orderBy('id').all();

            if (!cnds.length) continue;

            for (const cnd of cnds) {
                const new_cnd = await this.splitConduitAt(
                    cnd,
                    struct,
                    route,
                    new_route,
                    proportion
                );
                cnd_splits[cnd.getUrn()] = [cnd, new_cnd];
            }
        }
        // Build housing lookup
        let splits = {};
        splits = Object.assign(splits, cnd_splits);
        splits[route.getUrn()] = [route, new_route];

        for (const key of Object.keys(cnd_splits)) {
            const cnd = cnd_splits[key][0];
            const new_cnd = cnd_splits[key][1];
            const housing = splits[cnd.properties.housing][0];
            const new_housing = splits[cnd.properties.housing][1];

            new_cnd.properties.housing = new_housing.getUrn();
            await this.setConduitGeom(
                cnd,
                housing,
                /*update_segs=*/ false,
                /*update_contained_conduits=*/ false
            );
            await this.setConduitGeom(
                new_cnd,
                new_housing,
                /*update_segs=*/ false,
                /*update_contained_conduits=*/ false
            );
        }

        return cnd_splits;
    }

    /**
     * Split CND at STRUCT, putting new part into NEW_ROOT_HOUSING
     */
    async splitConduitAt(cnd, struct, root_housing, new_root_housing, proportion) {
        this.progress(3, 'Splitting', cnd, 'of', root_housing, 'at', struct);

        // Is this a conduit that could be chained with others
        const is_continuous = this.continuousConduit(cnd);

        // Add new conduit
        const new_cnd = await this.insertCopy(cnd, true);
        new_cnd.properties.root_housing = new_root_housing.getUrn();

        // If cnd has length... adjust lengths
        if (cnd.properties.length) {
            const original_length = cnd.properties.length;
            cnd.properties.length = original_length * proportion;
            new_cnd.properties.length = original_length * (1 - proportion);
        }

        // Set start / end structures
        cnd.properties.out_structure = struct.getUrn();
        new_cnd.properties.in_structure = struct.getUrn();

        if (is_continuous) {
            new_cnd.properties.name = cnd.properties.name;
            await this.linkConduitAfter(struct, cnd, new_cnd);
        }

        return new_cnd;
    }

    /**
     * Insert NEW_CONDUIT into the chain after CONDUIT
     */
    async linkConduitAfter(struct, conduit, new_conduit) {
        this.progress(2, 'Linking', conduit, 'after', new_conduit);

        const prev_conduit = await conduit.followRef('in_conduit');
        const next_conduit = await conduit.followRef('out_conduit');

        // Link new_conduit -> conduit
        await this.linkConduitsAt(struct, conduit, new_conduit);

        if (prev_conduit) {
            const in_struct = await conduit.followRef('in_structure');
            await this.linkConduitsAt(in_struct, prev_conduit, conduit);
        }

        if (next_conduit) {
            const out_struct = await new_conduit.followRef('out_structure');
            await this.linkConduitsAt(out_struct, new_conduit, next_conduit);
        }
    }

    // -----------------------------------------------------------------------
    //                             MAINTENANCE
    // -----------------------------------------------------------------------

    /**
     * Update conduits and segments inside HOUSING to match housing
     * geometry and structures (recursive)
     *
     * Returns list of cable segments modified
     */
    // ENH: Replace recursion by use of root_housing
    async updateConduits(housing) {
        const conduits = await this.conduitsOf(housing);
        const segs = [];

        for (const conduit of conduits) {
            // Update conduit
            const derived_props = this.derivedPropsFor(conduit, housing);
            conduit.properties.in_structure = derived_props['in_structure'];
            conduit.properties.out_structure = derived_props['out_structure'];

            const geom = this.derivedGeomFor(conduit, housing);
            conduit.geometry = geom;

            await this.update(conduit);

            // Update contained cables
            const contained_cable_segs = await this.nw_view.cable_mgr.updateSegments(conduit);
            segs.push(...contained_cable_segs);

            // Update conduit runs
            await this.maintainConduitRunFor(conduit);

            // Update contained conduits (and their cables)
            const conduit_segs = await this.updateConduits(conduit);
            segs.push(...conduit_segs);
        }

        return segs;
    }

    /**
     * Update geometry of all conduits in HOUSING (a route or conduit)
     */
    // ENH: Replace recursion by use of root_housing
    async updateConduitGeoms(housing, update_segs = true) {
        this.progress(4, 'Updating conduit geoms inside', housing);

        const segs = [];
        const cnds = await this.conduitsOf(housing);
        for (const cnd of cnds) {
            const cond_segs = await this.setConduitGeom(cnd, housing, update_segs);
            segs.push(...cond_segs);
        }

        return segs;
    }

    /**
     * Update geometry of CND to match HOUSING (a route or conduit)
     *
     * Also updates contained cable segments and conduit runs
     *
     * Returns cable segments modified
     */
    async setConduitGeom(cnd, housing, update_segs = true, update_contained_conduits = true) {
        this.progress(
            4,
            'Setting geometry of',
            cnd,
            'from',
            housing,
            update_segs,
            update_contained_conduits
        );

        // Update conduit
        // ENH: Only if changed

        const geom = this.derivedGeomFor(cnd, housing);
        cnd.geometry = geom;
        await this.update(cnd);

        // Update conduit run
        await this.maintainConduitRunFor(cnd);

        // Propagate changes to contained cables and conduits
        let segs = [];
        if (update_segs) {
            segs = await this.nw_view.cable_mgr.updateSegmentGeoms(cnd);
        }

        if (update_contained_conduits) {
            const updated_cnds = await this.updateConduitGeoms(cnd, update_segs);
            segs.push(...updated_cnds);
        }

        return segs;
    }

    /**
     * Delete conduits in housing and all inner conduits
     */
    // ENH: Replace recursion by use of root_houing
    async deleteConduitsIn(housing) {
        this.progress(3, 'Deleting conduits inside', housing);

        for (const conduit of await this.conduitsOf(housing)) {
            await this.deleteConduit(conduit);
        }
    }

    /**
     * Delete CONDUIT (and any inner conduits) (recursive)
     *
     * Throws error if cables are inside
     */
    async deleteConduit(conduit) {
        this.progress(5, 'Deleting conduit', conduit);

        // Check no cables
        await this.assertNoCables(conduit);

        // Delete inner conduits
        for (const inner_conduit of await this.conduitsOf(conduit)) {
            await this.deleteConduit(inner_conduit);
        }

        // Disconnect from chain (if necessary)
        await this.disconnectConduit(conduit);

        // Delete the conduit itself
        await this.deleteRecord(conduit);
    }

    /**
     * Throws DbConstraintError if CONDUIT contains cables
     */
    async assertNoCables(conduit) {
        if (await this.nw_view.cable_mgr.containsCable(conduit)) {
            throw new Error('conduit_has_cable', conduit);
        }
    }

    /**
     * Move CONDUIT into HOUSING
     * If conduit is continuous moves all conduits of run into corresponding housing
     */
    async moveToHousing(conduit, housing) {
        if (this.continuousConduit(conduit)) {
            // Move into continuous housing if appropriate
            const original_housing = await conduit.followRef('housing');
            const ordered_conduits = await this.conduitChain(conduit);

            // Move all condits in run into route
            if (this.continuousConduit(original_housing)) {
                await this.moveContConduitOutOfContHousingIntoRoute(
                    ordered_conduits,
                    original_housing
                );
            } else {
                await this.setHousing(conduit, housing);
            }

            // Move all conduits in run into appropriate housing
            if (this.continuousConduit(housing)) {
                await this.moveConduitIntoContinuousHousing(ordered_conduits, housing);
            } else {
                await this.setHousing(conduit, housing);
            }
        } else {
            this.progress(2, 'Moving', conduit, 'into', housing);
            await this.setHousing(conduit, housing);
        }
    }

    /**
     * Moves each segment of ORDERED_CONDUITS out of each segment of HOUSING (which is also a continuous conduit)
     * Puts each segment on the root_housing of the segment
     */
    async moveContConduitOutOfContHousingIntoRoute(ordered_conduits, housing_conduit) {
        // Find the connected conduits of housing_conduit
        const housing_conduits = await this.conduitChain(housing_conduit);
        const housing_conduit_urns = housing_conduits.map(conduit => conduit.getUrn());

        // For each conduit in the run
        for (const conduit of ordered_conduits) {
            // If conduit.housing is in housing_conduit... move it to root

            if (housing_conduit_urns.includes(conduit.properties.housing)) {
                conduit.properties.housing = conduit.properties.root_housing;
                await this.update(conduit);
            }
        }
    }

    /**
     * Moves each segment of ORDERED_CONDUITS into matching segments of HOUSING
     * HOUSING is also a continuous conduit
     */
    async moveConduitIntoContinuousHousing(ordered_conduits, housing_conduit) {
        const housing_conduits = await this.conduitChain(housing_conduit);

        // Build lookup table route -> housing_conduit
        const routes = {};
        for (const housing_conduit of housing_conduits) {
            routes[housing_conduit.properties.root_housing] = housing_conduit;
        }

        // For each conduit in the run...
        for (const conduit of ordered_conduits) {
            // Find housing in same route
            housing_conduit = routes[conduit.properties.root_housing];

            // If found move conduit into it
            if (housing_conduit) {
                conduit.properties.housing = housing_conduit.getUrn();
                await this.update(conduit);
            }
        }
    }

    // -----------------------------------------------------------------------
    //                          CHAIN MANAGEMENT
    // -----------------------------------------------------------------------

    /**
     * Throws DbConstraintError if FEATURE is inside a continuous conduit at STRUCT
     */
    async _assertCanConnectAt(feature, struct) {
        const housing = await feature.followRef('housing');

        if (this.isContinuousAt(housing, struct)) {
            throw new Error('conduit_is_continuous');
        }
    }

    /**
     * True if CONDUIT is a conduit and is passthrough at STRUCT
     */
    isContinuousAt(conduit, struct) {
        if (!this.continuousConduit(conduit)) {
            return false;
        }

        const struct_urn = struct.getUrn();

        if (conduit.properties.in_structure == struct_urn && conduit.properties.in_conduit) {
            return true;
        }

        if (conduit.properties.out_structure == struct_urn && conduit.properties.out_conduit) {
            return true;
        }

        return false;
    }

    /**
     * Returns true if conduit supports chaining
     */
    continuousConduit(conduit = undefined, feature_type = undefined) {
        if (!feature_type) {
            feature_type = conduit.getType();
        }

        return this.continuous_conduit_types.includes(feature_type);
    }

    /**
     * Returns conduit to which CONDUIT is connected in STRUCT (if any)
     */
    async connectedConduitAt(conduit, struct) {
        if (!this.isContinuousAt(conduit, struct)) {
            return;
        }

        const struct_urn = struct.getUrn();

        if (conduit.properties.in_structure == struct_urn) {
            return conduit.followRef('in_conduit');
        }

        if (conduit.properties.out_structure == struct_urn) {
            return conduit.followRef('out_conduit');
        }
    }

    /**
     * Connect CONDUIT1 to CONDUIT2 at STRUCT (if possible)
     */
    async connect(struct, conduit1, conduit2) {
        this.progress(2, 'Connecting', conduit1, 'to', conduit2, 'in', struct);

        if (
            (await this.nw_view.cable_mgr.containsCable(conduit1)) ||
            (await this.nw_view.cable_mgr.containsCable(conduit2))
        ) {
            throw new Error('conduit_contains_cable');
        }

        if (this.isContinuousAt(conduit1, struct) || this.isContinuousAt(conduit2, struct)) {
            throw new Error('conduit_already_connected');
        }

        const struct_urn = struct.getUrn();
        if (
            (conduit1.properties.in_structure != struct_urn &&
                conduit1.properties.out_structure != struct_urn) ||
            (conduit2.properties.in_structure != struct_urn &&
                conduit2.properties.out_structure != struct_urn)
        ) {
            throw new Error('conduit_not_found');
        }

        await this.linkConduitsAt(struct, conduit1, conduit2);

        // Update conduit run
        await this.maintainConduitRunFor(conduit1);
    }

    /**
     * Returns chain of conduits of which CONDUIT is a member
     */
    async conduitChain(conduit) {
        if (!this.continuousConduit(conduit)) {
            return [];
        }

        const orderedConduits = await this._orderedConduits(conduit);
        return orderedConduits;
    }

    /**
     * Connect CONDUIT_INFOS together
     *
     * CONDUIT_INFOS is list of [conduit,forward]
     */
    async chainConduits(conduit_infos) {
        // Firstly unlink conduits
        for (const conduit_info of conduit_infos) {
            conduit_info[0].properties.in_conduit = null;
            conduit_info[0].properties.out_conduit = null;
        }

        // Now link conduits
        for (let i = 0; i < conduit_infos.length; i++) {
            const conduit_info = conduit_infos[i];
            const conduit = conduit_info[0];

            if (i > 0) {
                const prev_conduit_info = conduit_infos[i - 1];
                const prev_conduit = prev_conduit_info[0];
                const prev_conduit_forward = prev_conduit_info[1];

                let struct;
                if (prev_conduit_forward) {
                    struct = await prev_conduit.followRef('out_structure');
                } else {
                    struct = await prev_conduit.followRef('in_structure');
                }

                await this.linkConduitsAt(struct, prev_conduit, conduit);
            }

            await this.update(conduit);
        }
    }

    /**
     * Disconnect CONDUIT from those either side of it
     */
    async disconnectConduit(conduit) {
        if (!this.continuousConduit(conduit)) {
            return;
        }

        const in_conduit = await conduit.followRef('in_conduit');
        if (in_conduit) {
            const in_struct = await conduit.followRef('in_structure');
            await this.unlinkConduitAt(in_struct, in_conduit);
            await this.maintainConduitRunFor(in_conduit);
        }

        const out_conduit = await conduit.followRef('out_conduit');
        if (out_conduit) {
            const out_struct = await conduit.followRef('out_structure');
            await this.unlinkConduitAt(out_struct, out_conduit);
            await this.maintainConduitRunFor(out_conduit);
        }

        if (!in_conduit && !out_conduit) {
            // Single standalone conduit, ensure run is deleted
            const conduit_run = await conduit.followRef('conduit_run');
            if (conduit_run) {
                await this.deleteRecord(conduit_run);
            }
        }
    }

    /**
     * Disconnect/cut conduit at pass through
     */
    async disconnectConduitAt(conduit, struct) {
        // Get current connected conduit
        const other_conduit = await this.connectedConduitAt(conduit, struct);

        if (!other_conduit) {
            this.progress(2, 'Conduit ! connected', conduit, 'at', struct);
            return;
        }

        // Prepare for update
        this.progress(2, 'Disconnecting', conduit, 'at', struct);

        // Unlink the conduits
        await this.unlinkConduitAt(struct, conduit);
        await this.unlinkConduitAt(struct, other_conduit);

        // Maintain the conduit runs
        await this.maintainConduitRunFor(conduit);
        await this.maintainConduitRunFor(other_conduit, undefined, true);
    }

    /**
     * Helper to follow chain of connected conduits
     *
     * CONDUITS - provide list of conduits to follow chain within
     * START_CONDUIT - provide to follow chain starting from that conduit, used if no chain provided
     */
    async _orderedConduits(start_conduit = undefined, conduits = undefined) {
        let get_joined_conduits;
        if (conduits === undefined) {
            // Follow reference fields
            get_joined_conduits = async conduit => {
                const in_conduit = await conduit.followRef('in_conduit');
                const out_conduit = await conduit.followRef('out_conduit');
                return [in_conduit, out_conduit];
            };
        } else {
            // Follow chain within provided conduits
            start_conduit = conduits[0];

            // Build mapping from urn -> conduit
            const conduits_map = {};
            for (const conduit of conduits) {
                conduits_map[conduit.getUrn()] = conduit;
            }

            get_joined_conduits = conduit => {
                const in_conduit = conduits_map[conduit.properties.in_conduit];
                const out_conduit = conduits_map[conduit.properties.out_conduit];
                return [in_conduit] || out_conduit;
            };
        }

        // Walk up to the 'head' of the chain, which is the end we reach first
        let seen_conduits = [];

        let head_conduit = undefined;
        let next_conduit = start_conduit;

        while (next_conduit) {
            head_conduit = next_conduit;
            seen_conduits.push(next_conduit);

            const joined_conduits = await get_joined_conduits(next_conduit);

            if (joined_conduits.includes(undefined)) {
                break;
            }

            next_conduit = undefined;
            for (const joined_conduit of joined_conduits) {
                if (!seen_conduits.includes(joined_conduit)) {
                    next_conduit = joined_conduit;
                    break;
                }
            }
        }

        // Now walk to the other end of the chain
        seen_conduits = [];
        const ordered_conduits = [];

        next_conduit = head_conduit;

        while (next_conduit) {
            ordered_conduits.push(next_conduit);
            seen_conduits.push(next_conduit);

            const joined_conduits = await get_joined_conduits(next_conduit);

            next_conduit = undefined;
            for (const joined_conduit of joined_conduits) {
                if (joined_conduit === undefined) {
                    continue;
                }

                const matched_conduits = seen_conduits.filter(
                    conduit => conduit.id == joined_conduit.id
                );
                if (!matched_conduits.length) {
                    next_conduit = joined_conduit;
                    break;
                }
            }
        }

        return ordered_conduits;
    }

    /**
     * Connect conduits at STRUCT
     *
     * Does NOT maintain conduit runs
     */
    async linkConduitsAt(struct, conduit1, conduit2) {
        this.progress(2, 'Linking', conduit1, '&&', conduit2, 'at', struct);

        const struct_urn = struct.getUrn();

        // Link 1 -> 2
        if (conduit1.properties.in_structure == struct_urn)
            conduit1.properties.in_conduit = conduit2.getUrn();
        if (conduit1.properties.out_structure == struct_urn)
            conduit1.properties.out_conduit = conduit2.getUrn();

        if (conduit2.properties.in_structure == struct_urn)
            conduit2.properties.in_conduit = conduit1.getUrn();
        if (conduit2.properties.out_structure == struct_urn)
            conduit2.properties.out_conduit = conduit1.getUrn();

        await this.update(conduit1);
        await this.update(conduit2);
    }

    /**
     * Disconnect CONDUIT in STRUCT
     *
     * Does NOT update the linked conduit i.e. leaves chain broke
     */
    // ENH: Do both sides of chain
    async unlinkConduitAt(struct, conduit) {
        const struct_urn = struct.getUrn();

        const unlinked_conduits = [];

        if (conduit.properties.in_structure == struct_urn) {
            const in_conduit = await conduit.followRef('in_conduit');
            if (in_conduit) {
                this.progress(6, 'Unlinking', conduit, 'from', in_conduit);
                if (!unlinked_conduits.filter(current => current.id == in_conduit.id).length) {
                    //conduit is not in current_conduit_runs
                    unlinked_conduits.push(in_conduit);
                }

                conduit.properties.in_conduit = null;
            }
        }

        if (conduit.properties.out_structure == struct_urn) {
            const out_conduit = await conduit.followRef('out_conduit');
            if (out_conduit) {
                this.progress(6, 'Unlinking', conduit, 'from', out_conduit);
                if (!unlinked_conduits.filter(current => current.id == out_conduit.id).length) {
                    //conduit is not in current_conduit_runsunlinked_conduits.push(out_conduit);
                    unlinked_conduits.push(out_conduit);
                }
                conduit.properties.out_conduit = null;
            }
        }

        await this.update(conduit);

        for (const unlinked_conduit of unlinked_conduits) {
            await this.unlinkConduitAt(struct, unlinked_conduit);
        }
    }

    // -----------------------------------------------------------------------
    //                                ROUTING
    // -----------------------------------------------------------------------

    /**
     * Returns an ordered list of routes
     */
    async findPath(structs, conduit_type = undefined) {
        // Use cable manager to find the path
        // ENH: Move to superclass or structure manager
        const cable_mgr = this.nw_view.cable_mgr;
        const route_infos = await cable_mgr.findPath(structs, conduit_type);

        // Get route records from result
        const routes = route_infos.map(route_info => route_info[0]);

        // Is the path for a continuous chain of conduits
        const continuous = conduit_type && this.continuousConduit(null, conduit_type);

        // Remove duplicates keeping order
        // Note: Unlike cables we don't want to create conduits both ways)
        if (!continuous) {
            return [...new Set(routes)]; //remove duplicates
        }

        // Include all routes for complete chain
        return routes;
    }

    /**
     * Route new conduits between STRUCTS. PROPS is a dict or GeoJSON feature
     *
     * If FEATURE_TYPE supports chaining, also creates as conduit run
     *
     * Returns the conduit records created
     */
    async routeConduit(feature_type, props, structs, count) {
        // ENH: Split this up

        this.progress(2, 'Route conduit', feature_type);

        // Use cable manager to find the path
        // ENH: Move to superclass or structure manager
        const cable_mgr = this.nw_view.cable_mgr;
        const route_infos = await cable_mgr.findPath(structs, feature_type);

        const continuous = this.continuousConduit(null, feature_type);

        const all_conduits = [];

        const conduit_table = await this.db_view.table(feature_type);

        // ENH: Make this configurable or a parameter
        const add_tube_number = continuous && count > 1;

        // Determine if we want to create bundles
        const bundle_feature_type = this.bundleFeatureType(feature_type);

        let bundle_table;
        let bundle_continuous;
        let create_bundle;

        if (bundle_feature_type) {
            bundle_table = await this.db_view.table(bundle_feature_type);
            bundle_continuous = this.continuousConduit(null, bundle_feature_type);
            create_bundle = count > 1;
        } else {
            create_bundle = false;
        }

        const bundle_chain = [];

        // For each conduit in bundle...
        for (let i = 0; i < count; i++) {
            const path_conduits = [];
            const processed_routes = [];

            let route_count = 0;

            // Route conduit
            for (let j = 0; j < route_infos.length; j++) {
                const route = route_infos[j][0];
                const forward = route_infos[j][1];
                // Do not create additional conduits for duplicate routes unless looking for a
                // continuous chain
                if (processed_routes.includes(route) && !continuous) {
                    continue;
                }
                processed_routes.push(route);

                // Create detached conduit
                const det_conduit = this._new_detached(conduit_table);
                det_conduit.geometry = props.geometry;
                det_conduit.properties = props.properties;
                det_conduit.id = det_conduit.properties.id = undefined;
                if (continuous) {
                    det_conduit.properties.conduit_run = undefined;
                    det_conduit.properties.in_conduit = undefined;
                    det_conduit.properties.out_conduit = undefined;
                }
                det_conduit.properties.root_housing = this.rootHousingUrn(route);
                det_conduit.properties.housing = route.getUrn();

                // Set housing to bundle if we have one
                if (bundle_chain.length >= route_count + 1) {
                    det_conduit.properties.housing = bundle_chain[route_count][0].getUrn();
                }

                const geom = route.geometry;

                // Always create conduits in same direction as route
                det_conduit.properties.in_structure = route.properties.in_structure;
                det_conduit.properties.out_structure = route.properties.out_structure;
                det_conduit.geometry = geom;

                // Insert the conduit running pre/pos insert trigger
                const new_conduit = await this.insertRecord(det_conduit, true);

                path_conduits.push([new_conduit, forward]);

                route_count += 1;

                if (create_bundle && i == 0) {
                    // Create a bundle conduit to put created conduits in
                    // Note that these are not going to be joined together
                    const det_bundle = this._new_detached(bundle_table);
                    det_bundle.properties = new_conduit.properties;
                    det_bundle.geometry = new_conduit.geometry;
                    det_bundle.properties.bundle_size = count;
                    det_bundle.id = det_bundle.properties.id = undefined;

                    const new_bundle = await this.insertRecord(det_bundle, true);
                    const new_bundle_urn = new_bundle.getUrn();

                    // Set as the housing on the conduit
                    new_conduit.properties.housing = new_bundle_urn;

                    bundle_chain.push([new_bundle, forward]);
                }
            }

            if (create_bundle && bundle_continuous && i == 0) {
                // Join bundle conduits together
                await this.chainConduits(bundle_chain);
                await this.maintainConduitRunFor(bundle_chain[0][0]);
            }

            if (continuous) {
                // Set consistent name
                let use_name = path_conduits[0][0].properties.name;

                if (add_tube_number) {
                    use_name = `${use_name} : ${i + 1}`;
                }

                for (const conduit_info of path_conduits) {
                    conduit_info[0].properties.name = use_name;
                    conduit_info[0].populateMywProps();
                }

                // Join conduits making up the path together
                await this.chainConduits(path_conduits);
                await this.maintainConduitRunFor(path_conduits[0][0]);
            }

            for (const conduit_info of path_conduits) {
                all_conduits.push(conduit_info[0]);
            }
        }

        return all_conduits;
    }

    // -----------------------------------------------------------------------
    //                              CONDUIT RUNS
    // -----------------------------------------------------------------------

    /**
     * Creates/updates conduit runs for continuous conduits
     *
     * ORDERED_CONDUITS - if provided this is the ordered path of conduits for the run
     *                    otherwise path is processed using conduit
     *
     * FORCE_NEW - if True then will generate a new conduit run record for the path.
     */
    // ENH: Split this method up, provide separate API for create new
    async maintainConduitRunFor(
        conduit = undefined,
        ordered_conduits = undefined,
        force_new = false,
        delete_unused = true
    ) {
        // Check for no need to create run
        const continuous = ordered_conduits || (conduit && this.continuousConduit(conduit));
        if (!continuous) {
            return;
        }

        this.progress(3, 'Maintaining conduit run for', conduit, force_new, delete_unused);

        // Find connected conduits
        if (ordered_conduits == undefined) {
            ordered_conduits = await this.conduitChain(conduit);
        }
        this.progress(6, 'Conduit chain:', ordered_conduits);

        // Find their conduit_run records
        const current_conduit_runs = [];
        if (!force_new) {
            for (const ordered_conduit of ordered_conduits) {
                const conduit_run = await ordered_conduit.followRef('conduit_run');

                if (
                    conduit_run &&
                    !current_conduit_runs.filter(current => current.id == conduit_run.id).length //conduit is not in current_conduit_runs
                ) {
                    current_conduit_runs.push(conduit_run);
                }
            }
        }

        current_conduit_runs.sort((a, b) => {
            return a.id - b.id;
        });

        this.progress(6, 'Found conduit runs:', current_conduit_runs);

        // Reduce to a single conduit_run record
        let use_run_record;
        if (current_conduit_runs.length == 0) {
            // Create a new one
            const run_table = await this.db_view.table('mywcom_conduit_run');
            const det_run = this._new_detached(run_table);
            use_run_record = await this.insertRecord(det_run, true);
        } else if (current_conduit_runs.length == 1) {
            use_run_record = current_conduit_runs[0];
        } else {
            // Have too many, keep first and delete the others
            use_run_record = current_conduit_runs[0];

            if (delete_unused) {
                for (let i = 1; i < current_conduit_runs.length; i++) {
                    const run_record = current_conduit_runs[i];
                    this.progress(4, 'Deleting', run_record);

                    // Ensure conduits no longer pointing at the run
                    const conduits = await run_record.followRefSet('conduits');
                    for (const conduit of conduits) {
                        conduit.properties.conduit_run = null;
                        await this.update(conduit);
                    }

                    await this.deleteRecord(run_record);
                }
            }
        }

        this.progress(3, 'Using', use_run_record);

        // Add conduits to run (where necessary)
        for (const conduit of ordered_conduits) {
            if (conduit.properties.conduit_run != use_run_record.getUrn()) {
                this.progress(
                    5,
                    'Changing',
                    conduit,
                    'run:',
                    conduit.properties.conduit_run,
                    '->',
                    use_run_record
                );
                conduit.properties.conduit_run = use_run_record.getUrn();
                await this.update(conduit);
            }
        }

        // Remove conduits no longer in run
        const use_run_record_conduits = await use_run_record.followRefSet('conduits');
        const ordered_conduit_ids = ordered_conduits.map(conduit => conduit.id);

        const orphaned_conduits = use_run_record_conduits.filter(
            x => !ordered_conduit_ids.includes(x.id)
        ); // use_run_record_conduits - ordered_conduits;

        for (const conduit of orphaned_conduits) {
            this.progress(5, 'Removing', conduit, 'from', conduit.conduit_run);
            conduit.properties.conduit_run = null;
            await this.update(conduit);
        }

        // Build run geometry
        const geom = this.calcConduitRunGeom(ordered_conduits);
        const original_geom = use_run_record.geometry;

        // If no geometry, and original geometry, update
        if (!geom) {
            if (original_geom) {
                use_run_record.geometry = null;
                await this.update(use_run_record);
            }
            return use_run_record;
        }

        if (!geomUtils.geomCoordsEqual(geom, original_geom)) {
            this.progress(5, 'Setting geometry for', use_run_record, 'to', geom);
            use_run_record.geometry = geom;
            await this.update(use_run_record);
        }

        return use_run_record;
    }

    /**
     * Set the geometry for CONDUIT_RUN from its conduits
     */
    // ENH: Only if unchanged?
    reBuildRunGeometry(conduit_run) {
        // Build new geometry
        const ordered_conduits = this.conduitRunChain(conduit_run);
        const geom = this.calcConduitRunGeom(ordered_conduits);

        // Set it
        conduit_run._primary_geom_field.set(geom);
        return this.update(conduit_run);
    }

    /**
     * The conduits of CONDUIT_RUN, in order
     */
    conduitRunChain(conduit_run) {
        const conduits = conduit_run._field('conduits').recs(/*ordered=*/ true);

        if (conduits.length == 0) {
            return [];
        }

        return this._orderedConduits(/*conduits=*/ conduits);
    }

    /**
     * Calculate line string based on ORDERED_CONDUITS
     */
    calcConduitRunGeom(ordered_conduits) {
        let coords = [];
        for (const ordered_conduit of ordered_conduits) {
            const conduit_geom = ordered_conduit.geometry;
            let conduit_coords = [...conduit_geom.coordinates];

            // Determine how to chain the conduit coordinates into the overall chain
            if (coords.length) {
                const composed_first_coord = coords[0];
                const composed_last_coord = coords[coords.length - 1];
                const conduit_first_coord = conduit_coords[0];
                const conduit_last_coord = conduit_coords[conduit_coords.length - 1];

                if (geomUtils.coordEqual(composed_first_coord, conduit_first_coord)) {
                    coords.reverse();
                } else if (geomUtils.coordEqual(composed_first_coord, conduit_last_coord)) {
                    coords.reverse();
                    conduit_coords = conduit_coords.reverse();
                } else if (geomUtils.coordEqual(composed_last_coord, conduit_last_coord)) {
                    conduit_coords = conduit_coords.reverse();
                }
            }

            for (const c of conduit_coords) {
                if (coords.length && geomUtils.coordEqual(c, coords[coords.length - 1])) {
                    continue;
                }
                coords.push(c);
            }
        }

        // Prevent wrong geometry being built
        coords = this.fixupLineStringCoords(coords);
        if (!coords) return undefined;

        return myw.geometry.lineString(coords);
    }

    // -----------------------------------------------------------------------
    //                                HELPERS
    // -----------------------------------------------------------------------

    /**
     * Returns conduits in HOUSING (a route or conduit)
     */
    async conduitsOf(housing, ordered = false) {
        if (!housing.featureDef.fields['conduits']) {
            return [];
        }

        return housing.followRefSet('conduits', ordered);
    }

    /**
     * Feature type to use as bundles for CONDUIT_TYPE
     */
    bundleFeatureType(conduit_type) {
        return this.nw_view.conduits[conduit_type]?.bundle_type;
    }

    /**
     * Conduit runs referenced by CONDUITS
     */
    conduitRunsFor(conduits) {
        return this.nw_view.referencedRecs(conduits, 'conduit_run');
    }

    // -----------------------------------------------------------------------
    //                                CONTENTS
    // -----------------------------------------------------------------------

    /**
     * All conduits that start or end at STRUCT
     */
    async conduitsAt(struct, include_proposed = false) {
        const struct_urn = struct.getUrn();

        let conduits = [];

        for (const feature_type in this.nw_view.conduits) {
            const tab = await this.db_view.table(feature_type);
            const filter = `[in_structure] = '${struct_urn}' | [out_structure] = '${struct_urn}'`;
            const pred = new FilterParser(filter).parse();
            const ft_conduits = await this.nw_view.getRecs(tab, pred, include_proposed);
            conduits = [...conduits, ...ft_conduits];
        }

        return conduits;
    }

    /**
     * All conduits in ROUTE
     */
    async conduitsIn(route, include_proposed = false) {
        const route_urn = route.getUrn();

        let conduits = [];

        for (const feature_type in this.nw_view.conduits) {
            const tab = await this.db_view.table(feature_type);
            const filter = `[root_housing] = '${route_urn}'`;
            const pred = new FilterParser(filter).parse();
            const feature_type_conduits = await this.nw_view.getRecs(tab, pred, include_proposed);
            conduits = [...conduits, ...feature_type_conduits];
        }

        return conduits;
    }
}

export default ConduitManager;
