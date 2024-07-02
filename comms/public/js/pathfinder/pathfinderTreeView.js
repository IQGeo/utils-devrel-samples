import myw from 'myWorld-client';
import _ from 'underscore';
import $ from 'jquery';

export default class PathfinderTreeView extends myw.TreeView {
    static {
        this.prototype.messageGroup = 'PathfinderModePlugin';
    }

    /**
     * Subclassed to use options.featureSet instead of app.currentfeatureSet
     * @override
     * @param {*} ev
     */
    leafHandleMouseEvent(ev) {
        ev.stopPropagation();
        const featureId = $(ev.currentTarget).parent().data('id');

        if (featureId) {
            const feature = this.options.featureSet.getFeatureByUrn(featureId);
            const trigger = ev.type == 'mouseenter' ? 'highlight-feature' : 'unhighlight-feature';
            this.options.app.fire(trigger, { feature: feature });
        }
    }

    /**
     * Subclassed to use options.featureSet instead of app.currentfeatureSet
     * @override
     * @param {*} ev
     */
    branchHandleMouseEvent(ev) {
        ev.preventDefault();
        const currentItemClass = $(ev.currentTarget).parent('li').attr('class');

        if (currentItemClass.indexOf('branch') >= 0) {
            const trigger = ev.type == 'mouseenter' ? 'highlight-feature' : 'unhighlight-feature';
            const children = $(ev.currentTarget).parent('li').data('children');
            _.each(children, node => {
                const feature = this.options.featureSet.getFeatureByUrn(node.getUrn(true, true));
                this.options.app.fire(trigger, { feature: feature });
            }).bind(this);
        }
    }

    /**
     * Subclassed to use options.featureSet instead of app.currentfeatureSet
     * @override
     * @param {*} ev
     */
    selectFeature(ev) {
        ev.stopPropagation();
        const featureId = $(ev.currentTarget).data('id');
        const feature = this.options.featureSet.getFeatureByUrn(featureId);
        this.setAsCurrentFeature(feature);
    }
}
