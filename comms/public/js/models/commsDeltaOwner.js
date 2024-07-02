// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import UserGroupFieldViewer from './userGroupFieldViewer';
import UserGroupFieldEditor from './userGroupFieldEditor';
import FeatureChange from '../validation/featureChange';

export default class CommsDeltaOwner extends myw.MyWorldFeature {
    static {
        this.prototype.messageGroup = 'CommsDeltaOwnerPlugin';
    }

    async preDelete(app) {
        if (myw.isNativeApp) {
            throw new Error(this.msg('cannot_delete_from_native'));
        }
    }

    /**
     * Override to add async and check if user is member of assigned user group.
     *
     * @returns {{Boolean}}
     * @override
     */
    async isEditable() {
        const editable = super.isEditable();

        const userGroupManager = myw.app.plugins.userGroupManager;
        const userGroupField = userGroupManager.getUserGroupFieldNameForFeatureType(this.getType());
        const groupId = this.properties[userGroupField];
        if (!groupId) {
            return editable;
        }

        const canViewAllDeltas = await myw.app.userHasPermission('mywcom.viewAllDeltas');
        const canEditMaster = await myw.app.userHasPermission('mywcom.editMaster');
        const isGroupMember = await userGroupManager.currentUserIsMemberOfGroup(groupId);
        return editable && (isGroupMember || canViewAllDeltas || canEditMaster);
    }

    /**
     * Overridden to support user group field editor
     *
     * Returns a field editor for a given field
     * Returns undefined if no custom editor is defined
     * @param  {fieldDD} fieldDD
     * @return {FieldViewer}
     * @override
     */
    getCustomFieldEditorFor(fieldDD) {
        // Get user group field viewer if required
        const userGroupField = myw.app.plugins.userGroupManager.getUserGroupFieldNameForFeatureType(
            this.getType()
        );

        if (userGroupField === fieldDD.internal_name) return UserGroupFieldEditor;

        return fieldDD.editor_class
            ? myw.Util.evalAccessors(fieldDD.editor_class)
            : this.fieldEditors[fieldDD.internal_name];
    }

    /**
     * Overridden to support user group field viewer
     *
     * Returns a field viewer for a given field if one is specified
     * Returns undefined if no custom viewer is defined
     * @param  {fieldDD} fieldDD
     * @return {FieldViewer}
     * @override
     */
    getCustomFieldViewerFor(fieldDD) {
        // Get user group field viewer if required
        const userGroupField = myw.app.plugins.userGroupManager.getUserGroupFieldNameForFeatureType(
            this.getType()
        );

        if (userGroupField === fieldDD.internal_name) return UserGroupFieldViewer;

        return fieldDD.viewer_class
            ? myw.Util.evalAccessors(fieldDD.viewer_class)
            : this.fieldViewers[fieldDD.internal_name];
    }

    /**
     * Resolve any conflicts for line of count by rebasing and setting line of count to stale.
     * @param {*} conflicts
     * @returns {Array<FeatureChange>}
     */
    async resolveConflicts(conflicts) {
        const delta = myw.app.getDelta();

        const results = await Promise.all(
            conflicts.map(async conflict => {
                const feature = conflict.delta;
                const type = feature.getType();
                if (['mywcom_line_of_count', 'mywcom_line_of_count_section'].includes(type)) {
                    let fields = [];
                    await feature.datasource.comms.rebaseFeature(delta, type, feature.id);

                    // Forces user to do a ripple
                    if (type === 'mywcom_line_of_count') {
                        feature.properties.stale = true;
                        const transaction = new myw.Transaction(myw.app.database);
                        transaction.addUpdate(feature);
                        fields = ['stale'];
                        await this.datasource.runTransaction(transaction);
                    }
                    return this.datasource.comms.featureChangeFrom(
                        'rebase',
                        fields,
                        type,
                        feature,
                        feature,
                        this
                    );
                } else return null;
            })
        );

        // Filter out conflicts that we didn't resolve.
        return results.filter(result => result);
    }
}
