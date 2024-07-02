import myw from 'myWorld-client';
import PathfinderTreeView from './pathfinderTreeView';

export default class PathfinderTraceResultsControl extends myw.TraceResultControl {
    static {
        this.prototype.messageGroup = 'PathfinderModePlugin';
    }

    constructor(owner, options) {
        super(owner, options);
        this.traceResults = options.traceResults;

        this.featureSet = new myw.FeatureSet(
            Object.keys(this.traceResults.nodes).map(key => {
                return this.traceResults.nodes[key];
            })
        );
    }

    /**
     * Subclassed to use PathfinderTreeView and insert into rendered DOM elements from React
     * @override
     */
    render() {
        this.rootBranch = this.traceResults.start;
        this.traceResults.start.buildSpine();

        const treeView = new PathfinderTreeView({
            messageGroup: 'TracePlugin',
            featureSet: this.featureSet,
            app: this.app,
            root: this.rootBranch,
            zoomEnabled: false,
            leafRenderer(node, type) {
                if (type === 'node') {
                    return `Branch: ${node.feature.getTitle()}`;
                }

                if (node.is_new_connection !== undefined) {
                    return `* ${node.feature.getTitle()}`;
                }

                return node.feature.getTitle();
            },
            branchRenderer(children) {
                return `Branch: ${children.length} objects`;
            }
        });
        treeView.render();
        treeView.$el.addClass(['subinfo', 'collapse']);
        treeView.$el.prop('role', 'group');
        const treeViewHtml = treeView.$el[0];
        this.el.appendChild(treeViewHtml);
    }
}
