import myw from 'myWorld-client';

export function showCreateDialog(onCreate = () => {}, system) {
    new myw.CreateUserGroupDialog({
        owner: {
            populateGroupsList: () => {
                onCreate();
            },
            system
        }
    });
}
