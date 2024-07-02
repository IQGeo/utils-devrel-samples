// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';

export default class UserGroupManagerPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'UserGroupManager';
    }

    /**
     * @class Provides API for working with user groups
     *
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
        this.designConfig = myw.config['mywcom.designs'];
    }

    /**
     *
     * @param {string} groupId
     * @returns Group
     */
    async getGroup(groupId) {
        try {
            const group = await this.app.system.getGroup(groupId);
            const members = _.keys(group.members);
            return {
                ...group,
                members
            };
        } catch {
            return undefined;
        }
    }

    /**
     * Returns a list of groupIds that the current user is either an owner or member of.
     *
     * @returns {number[]}
     */
    async getGroupsIds() {
        return this.app.system.getGroupsIds();
    }

    /**
     * Gets all the groups that the user is a member of or owns.
     * @param {options} options
     * @returns Groups
     */
    async getGroups(options = { includeMembers: false }) {
        const groupIds = await this.getGroupsIds();

        if (options.includeMembers) {
            return Promise.all(
                groupIds.map(async id => {
                    const group = await this.getGroup(id);
                    return {
                        ...group,
                        id
                    };
                })
            );
        }

        return groupIds.map(id => {
            const groupOwnerNameArray = id.split(':');
            return {
                owner: groupOwnerNameArray[0],
                name: groupOwnerNameArray[1],
                id
            };
        });
    }

    /**
     * Checks to see if a user is in the group
     *
     * @param {string} groupName
     * @returns {boolean}
     */
    async currentUserIsMemberOfGroup(groupId) {
        const groups = await this.getGroups();
        return groups.findIndex(group => group.id === groupId) >= 0;
    }

    /**
     *
     * gets configured user group field name for feature
     * @param  {string} feature type
     * @return {string} user group field name
     */
    getUserGroupFieldNameForFeatureType(featureType) {
        return this.designConfig[featureType]?.userGroup;
    }

    async deleteGroup(groupId) {
        await this.app.system.deleteGroup(groupId);
    }

    /**
     * Updates/Inserts a user group.
     *
     * @param {Group} group
     */
    async saveGroup(group) {
        group.members =
            group.members?.reduce((obj, member) => {
                return {
                    ...obj,
                    [member]: false
                };
            }, {}) || {};

        if (group.id) {
            return this.app.system.updateGroup(group.id, group);
        } else {
            return this.app.system.saveGroup(group);
        }
    }

    /**
     * Updates/Inserts a user group.
     *
     * @param {Group} group
     */
    async saveGroups(groups) {
        return Promise.all(
            groups.map(async group => {
                return this.saveGroup(group);
            })
        );
    }
}
