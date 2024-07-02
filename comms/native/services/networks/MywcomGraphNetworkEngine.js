// Copyright: IQGeo Limited 2010-2023

import _ from 'underscore';
import Heap from 'heap';
import { GraphNetworkEngine, NetworkEngine } from 'myWorld-native-services';
import AStarTraceNode from './AStarTraceNode';

/*eslint-disable no-await-in-loop*/
class MywcomGraphNetworkEngine extends GraphNetworkEngine {
    /**
     * A network engine operating on a 'simple graph' connectivity model
     *
     * In this model each feature is link and holds a direct
     * reference to its upstream and downstream connections. The
     * names of the fields holding the references are configured
     * via the network definition.
     */
    //
    // Subclassed to improve performance:
    //   - Use cached feature view
    //   - Use A* algorithm for shortest path tracing
    //   - Reduce duplicated queries in undirected networks
    //
    // ENH: Move changes to core and remove this

    constructor(view, networkDef, extraFilters) {
        // Init super
        super(view, networkDef, extraFilters);

        // TBR: Workaround for PLAT-7960
        if (!view.__proto__.table && view._dbView) {
            view.__proto__.table = function (tableName) {
                return this._dbView.table(tableName);
            };
        }

        // ENH: Use cached view (for speed)
        this.db_view = view;
    }

    /**
     * Create the start node for URN
     */
    // Subclassed to use comms trace node class
    async rootNode(urn, direction) {
        const feature = await this.featureRecFor(urn);
        return new AStarTraceNode(feature, 0.0);
    }

    /**
     * Returns nodes directly reachable from NODE
     *
     * DIRECTION is 'upstream', 'downstream' or 'both'.
     * ROOT_NODE is the root of the current trace (unused here).
     */
    // Subclassed to use comms trace node class
    async connectedNodes(node, direction) {
        const featureRecs = await this.connectedFeaturesFor(node.feature, direction);
        const nodes = featureRecs.map(featureRec => {
            if (!featureRec) return;
            const featureLen = this.lengthOf(featureRec); // ENH: Do lazily
            return new AStarTraceNode(featureRec, node.dist + featureLen, node);
        });
        return _.compact(nodes);
    }

    async _trace(fromUrn, direction, options) {
        // Add start node
        const rootNode = await this.rootNode(fromUrn, direction);
        const activeNodes = new Heap((a, b) => a.cmp(b)); // TraceNodes in the 'wave front'
        const visitedNodes = {}; // Paths we have encountered so far
        visitedNodes[rootNode.node_id] = true;

        // MYWCOM: START
        if (options.stopUrns) {
            options.stopGeoms = await this._stopGeoms(options.stopUrns);
        }
        // MYWCOM: END

        const stop = await this._traceNode(
            rootNode,
            activeNodes,
            visitedNodes,
            direction,
            rootNode,
            options
        );
        return { root: rootNode, stop: stop };
    }

    /**
     * Find objects reachable from FROM_URN (in distance order)
     *
     * Optional MAX_DIST is distance at which to stop tracing (in
     * metres). Optional STOP_URNS is a list of feature urns we are
     * trying to find. Tracing terminates when one of these is encourtered.
     *
     * Returns MywTraceNodes:
     *  ROOT_NODE   The node from which tracing started
     *  STOP_NODE   The node which caused tracing to stop (if any)
     */
    // Subclassed to use A* algorithm for shortest path
    // and add some feature caching to reduce queries
    async _traceNode(node, activeNodes, visitedNodes, direction, rootNode, options) {
        const nodeUrn = node.feature.getUrn();
        const stopUrns = options.stopUrns || [];
        //trace(4, 'Processing:', node.ident());

        // Check for found stop node
        if (stopUrns.includes(nodeUrn)) return node;

        let connectedNodes; //promise
        // Check for node beyond distance limit
        if (node.partial) {
            connectedNodes = [];
        } else {
            connectedNodes = await this.connectedNodes(node, direction, rootNode);
        }
        // Add end nodes of connected items to wavefront
        connectedNodes.forEach(connNode => {
            //trace(5, '  Connection:', connNode.ident());

            // Check for already found
            if (visitedNodes[connNode.node_id]) {
                //trace(8, '  Already visited');
                return;
            }

            // Check for end beyond distance limit
            // Note: This may change the node_id
            if (options.maxDist && connNode.dist > options.maxDist) {
                //trace(7, '  Beyond max dist');
                connNode.stopAt(options.maxDist);
            }

            //Prevent cycles
            visitedNodes[connNode.node_id] = true;

            // Prevent memory overflow etc
            if (options.maxNodes && Object.keys(visitedNodes).length > options.maxNodes) {
                //trace(4, '  Visited nodes exceeds max:', options.maxNodes);
                throw new Error('Trace size limit exceeded');
            }

            // Add to wavefront
            //trace(6, '  Activating:', connNode.ident());

            // MYWCOM: Include distance to stop nodes as part of A* algrorithm
            if (options.stopGeoms) {
                connNode.minPossibleDist =
                    connNode.dist + connNode.minDistanceTo(options.stopGeoms);
            }
            // MYWCOM: END

            activeNodes.push(connNode);

            node.children.push(connNode);
        });

        if (activeNodes.empty()) return;

        // Move to next closest node
        const nextNode = activeNodes.pop();
        return this._traceNode(nextNode, activeNodes, visitedNodes, direction, rootNode, options);
    }

    /**
     * Returns geometries for STOP_URNS
     */
    async _stopGeoms(stopUrns) {
        const stopGeoms = [];
        for (const stopUrn of stopUrns) {
            const stopFtr = await this.featureRecFor(stopUrn);
            if (stopFtr && stopFtr.geometry) {
                stopGeoms.push(stopFtr.geometry);
            }
        }

        return stopGeoms;
    }

    /**
     * Returns features directly reachable from FEATURE
     *
     * DIRECTION is 'upstream', 'downstream' or 'both'
     */
    // Subclassed to support 'both' (performance optimisation)
    async connectedFeaturesFor(feature, direction) {
        let recs;
        if (direction == 'both' || !this.networkDef.directed) {
            recs = await this._connectedFeaturesFor(feature, 'both');
        } else {
            recs = await this._connectedFeaturesFor(feature, direction);
        }
        return recs;
    }

    /**
     * Returns features directly reachable from FEATURE
     *
     * DIRECTION is 'upstream' or 'downstream' or 'both'
     */
    // Subclassed to support 'both' (performance optimisation)
    async _connectedFeaturesFor(feature, direction) {
        if (direction == 'both') {
            const upstream_field = this.featurePropFieldName(feature.getType(), 'upstream');
            const downstream_field = this.featurePropFieldName(feature.getType(), 'downstream');

            if (upstream_field == downstream_field) {
                return this._getFeaturesFor(feature, 'upstream');
            } else {
                const upstream_recs = await this._getFeaturesFor(feature, 'upstream');
                const downstream_recs = await this._getFeaturesFor(feature, 'downstream');
                return [...upstream_recs, ...downstream_recs];
            }
        }

        return this._getFeaturesFor(feature, direction);
    }

    /**
     * Returns features found following the configured field for DIRECTION
     * DIRECTION is one of 'upstream' or 'downstream'
     */
    async _getFeaturesFor(feature, direction) {
        let fieldName = this.featurePropFieldName(feature.table.name, direction);
        if (!fieldName) return [];

        //get records
        const recs = await feature.followRefSet(fieldName);

        //apply filters
        return recs.filter(this.includesFeature.bind(this));
    }
}

NetworkEngine.engines['mywcom_graph_network_engine'] = MywcomGraphNetworkEngine;

export default MywcomGraphNetworkEngine;
