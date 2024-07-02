import { msg, FieldViewer } from 'myWorld-client';

/**
 * @name UserGroupFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
class UserGroupFieldViewer extends FieldViewer {
    static {
        this.prototype.tagName = 'span';
        this.prototype.messageGroup = 'FeatureViewer';
    }

    /**
     * Converts a value to an appropriate string to display to the user and
     * sets it as the content of self's element
     *
     * @override
     */
    renderValue(fieldValue) {
        super.renderValue(fieldValue);

        const userGroupManager = this.app.plugins['userGroupManager'];
        userGroupManager
            .getGroup(fieldValue)
            .then(group => {
                const displayValue = group
                    ? group.name
                    : msg('design_group_invalid_reference', {
                          groupId: this.fieldValue
                      });
                this.$el.html(displayValue);
            })
            .catch(e => {
                console.warn(
                    `Unable to convert value for field '${this.fieldName}'. Exception:`,
                    e
                );
            });
    }
}

export default UserGroupFieldViewer;
