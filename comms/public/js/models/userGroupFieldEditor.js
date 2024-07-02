// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

/**
 * Input for the user group field.
 *
 * @name UserGroupFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
class UserGroupFieldEditor extends myw.FieldEditor {
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.initialize(owner, feature, fieldDD, options);
    }
    async initialize(owner, feature, fieldDD, options) {
        this.userGroupManager = this.app.plugins['userGroupManager'];
        const items = await this.addDropDownItems();
        this.control = this.buildDropDownControl(items);

        this.$el.html(this.control.el);
    }

    buildDropDownControl(items) {
        const control = new myw.Dropdown({
            options: items,
            selected: this.fieldValue
        });
        return control;
    }

    async addDropDownItems() {
        const groups = await this.userGroupManager.getGroups();
        const options = [{ id: '', label: '' }];
        if (this.fieldValue && groups.findIndex(group => group.id === this.fieldValue) === -1) {
            //The group is not in the list because;
            //1. It was removed
            //2. The current user is not a member/owner of it.
            const { msg } = myw.useLocale('FeatureEditor');
            const group = await this.userGroupManager.getGroup(this.fieldValue);
            const name = group
                ? group.name
                : msg('design_group_invalid_reference', { groupId: this.fieldValue });
            options.push({ id: this.fieldValue, label: name });
        }
        groups.forEach(group => {
            options.push({ id: group.id, label: group.name });
        });

        return options;
    }
}

export default UserGroupFieldEditor;
