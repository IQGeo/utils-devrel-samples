import FiberTraceReport from './fiberTraceReport';
import { formatLengthStr, formatdBStr } from '../base/strUtils';
import myw from 'myWorld-client';
import ReportTable from './streams/reportTable';

export default class CopperTraceReport extends FiberTraceReport {
    static {
        /**
         * @class Report detailing the feature returned by a copper trace
         */
        this.prototype.messageGroup = 'CopperTraceReport';

        // Customization hooks
        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, featureSet) {
        return featureSet.isTraceResult & (featureSet.tech === 'copper');
    }

    writeBody(strm) {
        const cols = ['feature'];
        const colHeadings = {
            feature: this.msg('feature')
        };

        const colStyles = {};

        for (let i = 0; i <= this.maxDepth; i++) {
            const nodeCols = [
                `connType:${i}`,
                `feature:${i}`,
                `pins:${i}`,
                `distance:${i}`,
                `individualLoss:${i}`,
                `cumulativeLoss:${i}`,
                `ewl_aed:${i}`
            ];

            cols.push(...nodeCols);

            for (const colName of nodeCols) {
                const msgName = colName.split(':')[0];
                colHeadings[colName] = this.msg(msgName);
                if (
                    colName.includes('distance') ||
                    colName.includes('individualLoss') ||
                    colName.includes('cumulativeLoss')
                )
                    colStyles[colName] = { hAlign: 'right' };
            }
        }

        cols.push(...['ports', 'from', 'to']);

        const tab = new ReportTable(cols);
        tab.nextRow();

        // Build table from root node
        this.outputSpine(tab, this.spine[0]);

        const options = { colHeadings, colStyles, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);
    }

    /**
     * Outputs data relevant to traceNode to 'tab'
     */
    outputNode(tab, group, traceNode, spineNo, showConnType) {
        if (showConnType) tab.add(`connType:${group}`, '->');

        const ewl = this.calculateEWL(traceNode);
        tab.add(`feature:${group}`, traceNode.properties.name || traceNode.getTitle());
        tab.add(`pins:${group}`, traceNode.ports);
        tab.add(`distance:${group}`, formatLengthStr(traceNode.dist));
        tab.add(`individualLoss:${group}`, formatdBStr(traceNode.individualLoss));
        tab.add(`cumulativeLoss:${group}`, formatdBStr(traceNode.cumulativeLoss));
        tab.add(`ewl_aed:${group}`, ewl ? formatLengthStr(ewl) : null);

        if (traceNode.from_ || traceNode.to_) {
            let fromText = traceNode.from_ ?? '';
            const regExp = /^-?\d*\.?\d*$/; // Test if string is number
            let isNumeric = regExp.test(fromText);
            if (isNumeric) fromText = `#${fromText}`;

            let toText = traceNode.to_ ?? '';
            isNumeric = regExp.test(toText);
            if (isNumeric) toText = `#${toText}`;
            const fromToStr = `${fromText} -> ${toText}`;
            tab.add(`pins:${group}`, fromToStr);
        }
        if (traceNode.fibers) tab.add(`pins:${group}`, `#${traceNode.fibers}`);
    }

    /**
     * Calculate the Effective working length (Access Edge Distance) of a copper cable
     */
    calculateEWL(traceNode) {
        let ewl;
        if (traceNode.length) {
            const conversion = myw.config['mywcom.ewl'].conversions.filter(
                con => con.gauge === traceNode.feature.properties?.gauge
            )[0]?.ewl;
            ewl = conversion * parseFloat(traceNode.length);
        }
        return ewl;
    }
}
