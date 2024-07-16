import _ from 'underscore';
import PinRange from './pinRange';
import CableTree from './cableTree';
import myw from 'myWorld-client';

export default class RouteContents extends myw.Class {
    /**
     * Initialize from containment service result 'result'
     */
    constructor(route, result) {
        super();
        this.route = route;
        this.routeInfo = result;

        this.features = {};
        this.conduits = this._addFeatures(result.conduits);
        this.conduit_runs = this._addFeatures(result.conduit_runs);
        this.cables = this._addFeatures(result.cables);
        this.segs = this._addFeatures(result.cable_segs);
        this.circuitInfos = this._circuitInfosFrom(result.circuits);

        this.segCircuitInfos = _.groupBy(this.circuitInfos, 'seg_urn');
    }

    /**
     * Returns 'features' as a list, keyed by urn
     *
     * Also adds them to this.features (the list of all known features)
     */
    _addFeatures(ftrs) {
        const ftrsByUrn = {};

        for (const ftr of ftrs) {
            const urn = ftr.getUrn();
            ftrsByUrn[urn] = ftr;
            this.features[urn] = ftr;
        }

        return ftrs; // TODO: Fix code and return keyed list
    }

    /**
     * Mutate circuit summary info from containment result
     */
    _circuitInfosFrom(infos) {
        for (const info of infos) {
            info.pins = new PinRange(info.side, info.low, info.high);
            delete info.side;
            delete info.low;
            delete info.high;
        }
        return infos;
    }

    /**
     * Returns a route containment tree
     */
    // ENH: Splice up, move tree building to cableTreeView?
    cableTree() {
        // Build lookup table urn -> node
        const nodes = {};
        const urn = this.route.getUrn();
        nodes[urn] = CableTree.featureNode(this.route);

        for (const conduit of this.conduits) {
            const node = CableTree.featureNode(conduit);
            node.conduitRun = this.features[conduit.properties.conduit_run];
            nodes[conduit.getUrn()] = node;
        }

        for (const seg of this.segs) {
            const segUrn = seg.getUrn();
            const segCircs = this.segCircuitInfos[segUrn];

            nodes[segUrn] = CableTree.segNode(
                seg,
                this.features[seg.properties.cable],
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                segCircs
            );
        }

        // Build tree
        for (const feature of [...this.conduits, ...this.segs]) {
            const housingUrn = feature.properties.housing;
            const parentNode = nodes[housingUrn];

            if (parentNode) {
                parentNode.children.push(nodes[feature.getUrn()]);
            } else {
                console.log(feature, ' : Cannot find housing ', housingUrn); // ENH: Use .trace()
            }
        }

        return nodes[urn];
    }
}
