// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class Graph extends myw.Class {
    constructor(nodes) {
        super();
        this.nodes = nodes;
        this.order = this._order();
    }

    /**
     * Controls position of self in schematic (smaller means lower down)
     */
    _order() {
        const linkTypes = {};
        for (const node of this.nodes) {
            for (const link of node.outLinks) {
                linkTypes[link.type] = true;
            }
        }

        if (Object.values(linkTypes).length == 1 && linkTypes.cable) return 1; // Case: Passthrough only
        return 2;
    }

    /**
     * The upstream nodes of self
     */
    // ENH: Sort by complexity
    orderedNodes() {
        const sortProc = function (n1, n2) {
            return n1.order() - n2.order();
        };
        return this.nodes.sort(sortProc);
    }
}
