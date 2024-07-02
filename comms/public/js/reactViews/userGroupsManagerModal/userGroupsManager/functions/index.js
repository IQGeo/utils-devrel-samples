export function filterUserGroups(groups, searchValue) {
    if (!searchValue) return groups;

    // Filtering should be case insensative.
    const searchValueLowerCase = searchValue.toLowerCase();
    return groups.filter(group => {
        return (
            group.name?.toLowerCase().includes(searchValueLowerCase) ||
            group.description?.toLowerCase().includes(searchValueLowerCase) ||
            group.members?.filter(member => member?.toLowerCase().includes(searchValueLowerCase))
                .length > 0
        );
    });
}

export function loadUserGroups(setUserGroups, userGroupManager) {
    (async function fetchData() {
        let groups = await userGroupManager.getGroups({
            includeMembers: true
        });
        setUserGroups(groups);
    })();
}
