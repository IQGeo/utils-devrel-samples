import FiberTraceReport from './fiberTraceReport';

export default class CoaxTraceReport extends FiberTraceReport {
    static {
        /**
         * @class Report detailing the feature returned by a copper trace
         */
        this.prototype.messageGroup = 'CoaxTraceReport';

        // Customization hooks
        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, featureSet) {
        return featureSet.isTraceResult & (featureSet.tech === 'coax');
    }
}
