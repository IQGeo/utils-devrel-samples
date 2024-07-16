import PinRange from './pinRange';
import myw from 'myWorld-client';

/**
 * A node in a cable tree
 */
class CableTree extends myw.Class {
    static segNode(
        seg,
        cable,
        cableSide = undefined,
        side = undefined,
        nConnected = undefined,
        conns = undefined,
        housing = undefined,
        struct = undefined,
        circuits = undefined
    ) {
        const node = CableTree.featureNode(seg);
        node.cable = cable;
        node.cable_side = cableSide;
        node.pins = new PinRange('in', 1, cable.pinCount());
        node.side = side;
        node.n_connected = nConnected;
        node.conns = conns;
        node.housing = housing;
        node.circuits = circuits;

        return node;
    }

    static cableNode(cable, housing = null) {
        const node = CableTree.featureNode(cable);
        node.nodeType = 'cable';
        node.housing = housing;
        return node;
    }

    static featureNode(feature) {
        return { feature: feature, children: [] };
    }
}

export default CableTree;
