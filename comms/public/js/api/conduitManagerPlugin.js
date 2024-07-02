// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';

export default class ConduitManagerPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'ConduitManager';
    }

    /**
     * @class Provides API for maintaining conduits
     *
     * Called from StructManager. Provides functions for maintaining and splitting conduits
     * (and the cables they contain)
     *
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');

        const cfg = myw.config['mywcom.conduits'];

        this.conduitFeatureTypes = Object.keys(cfg);

        const continuousTypes = [];

        _.each(cfg, (entry, ft) => {
            if (entry.continuous) continuousTypes.push(ft);
        });

        this.continuousFeatureTypes = continuousTypes;
    }

    fireFeatureEvents(aspect) {
        this.conduitFeatureTypes.forEach(conduitFeatureType =>
            this.app.fire('featureCollection-modified', { featureType: conduitFeatureType })
        );
    }

    // Disconnect/cut the conduit at housing
    async disconnectConduit(conduit, housing) {
        const result = await this.ds.comms.disconnectConduit(conduit, housing);

        this.trigger('disconnected', { conduit, housing });

        return result;
    }

    // Connect conduits at housing
    async connectConduits(housing, first_conduit, second_conduit) {
        const result = await this.ds.comms.connectConduits(housing, first_conduit, second_conduit);

        this.trigger('connected', { housing, first_conduit, second_conduit });

        return result;
    }

    /**
     * Route new conduits for all conduits that are part of the conduit hierarchy.
     *
     * @param {*} conduitsJson
     * @param {*} structures
     * @param {*} parentConduits
     * @param {*} transaction
     * @returns All features created from the conduit hierarchy
     */
    async routeNestedConduits(conduitsJson, structures, parentConduits, transaction) {
        let updateTransaction = transaction;
        if (!updateTransaction) updateTransaction = this.ds.transaction();

        const cableManager = this.app.plugins.cableManager;

        const conduits = await Promise.all(
            conduitsJson.map(async conduitJson => {
                // For now we're going to call this for each conduit in the hierarchy.
                let createdConduits = await this.ds.comms.routeConduit(
                    conduitJson.feature_type,
                    conduitJson,
                    structures,
                    1 // Will always be one. We don't want bundles being created for assemblies.
                );

                // Each conduit needs to udpated so the housing matches the parent conduits urn.
                createdConduits.forEach(conduit => {
                    if (parentConduits) {
                        // Find the parent conduit
                        const parentConduit = _.find(parentConduits, parentConduit => {
                            return (
                                parentConduit.properties.root_housing ==
                                conduit.properties.root_housing
                            );
                        });

                        // Create an update transaction to associate the correct housing.
                        conduit.properties.housing = parentConduit.getUrn();
                        conduit.secondary_geometries = {};
                        updateTransaction.addUpdate(conduit);
                    }
                });

                // Route all the child conduits of this conduit.
                if (conduitJson.conduits) {
                    const createdNestedConduits = await this.routeNestedConduits(
                        conduitJson.conduits,
                        structures,
                        createdConduits,
                        updateTransaction
                    );

                    createdConduits = createdConduits.concat(createdNestedConduits);
                }

                // Route all the cables in this conduit.
                if (conduitJson.cables) {
                    const createdCables = await cableManager.routeCables(
                        conduitJson.cables,
                        structures,
                        createdConduits
                    );

                    createdConduits = createdConduits.concat(createdCables);
                }

                return createdConduits;
            })
        );

        //If a transaction wasn't passed in, we are at the top level and commit the transaction.
        if (!transaction) {
            await this.ds.comms.runTransaction(updateTransaction);
        }

        return conduits.flat();
    }

    /*
     * Move cable segment or conduit 'feature' to a new housing in same route
     *
     * Deals with propagation of changes along path when moving into/out of a continuous conduit
     */
    async moveInto(housing, feature) {
        const result = await this.ds.comms.moveInto(housing, feature);
        if (!result.ok) throw new Error(result.error);
    }

    // Returns true if feature is configured as a continuous type of conduit
    isContinuousConduitType(feature) {
        return _.includes(this.continuousFeatureTypes, feature.getType());
    }
}
