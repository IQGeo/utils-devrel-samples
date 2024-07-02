// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class Node extends myw.Class {
    /**
     * Init slots. 'side' indicates side of structure self is on ('in', 'int' or 'out')
     */
    constructor(feature, side) {
        super();
        this.feature = feature;
        this.side = side;
        this.inLinks = [];
        this.outLinks = [];
        this.row = 0;
        this.col = 0;
    }

    /**
     * The subgraph of which self is a part
     *
     * Returns a list of nodes
     */
    connectedNodes(nodes = []) {
        if (nodes.includes(this)) return nodes;

        nodes.push(this);
        for (const link of this.inLinks) {
            nodes = link.node1.connectedNodes(nodes);
        }
        for (const link of this.outLinks) {
            nodes = link.node2.connectedNodes(nodes);
        }

        return nodes;
    }

    /**
     * Link of type 'linkType' that runs from self to 'node' (if any)
     */
    linkTo(node, linkType) {
        for (const link of this.outLinks) {
            if (link.node2 === node && link.type === linkType) return link;
        }
    }

    /**
     * Controls position of self in subgraph (smaller means lower down)
     */
    order() {
        if (!this._order) this._order = this._computeOrder();
        return this._order;
    }

    _computeOrder() {
        let order = 1;
        if (this.side == 'in') return order;
        order += 1000;
        if (!this.inLinks.length) return order;
        return order + this.inLinks.length + this.outLinks.length;
    }
}
