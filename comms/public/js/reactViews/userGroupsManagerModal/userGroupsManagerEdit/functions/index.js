import myw from 'myWorld-client';

export function showEditDialog(group, onEdit = () => {}, system) {
    new myw.UserGroupEditor({
        owner: {
            populateGroupsList: () => {
                onEdit();
            }
        },
        system,
        groupId: group.id
    });
}
