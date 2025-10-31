export const sortMilestones = array => {
    // Create a copy to avoid mutating the original array (best practice).
    const sortedArray = [...array];

    sortedArray.sort((a, b) => {
        // Helper function to safely convert a value to an integer.
        const toInt = value => (value === null || value === undefined ? null : parseInt(value, 10));

        // Compare by project_id (numeric, ascending)
        const projectIdA = toInt(a.project_id);
        const projectIdB = toInt(b.project_id);
        if (projectIdA !== projectIdB) {
            return projectIdA - projectIdB;
        }

        // Compare by parent_id (numeric, nulls first)
        const parentIdA = toInt(a.parent_id);
        const parentIdB = toInt(b.parent_id);
        if (parentIdA !== parentIdB) {
            // Logic for nulls first:
            // If a.parent_id is null, it comes first (-1).
            if (parentIdA === null) return -1;
            // If b.parent_id is null, it comes first (1).
            if (parentIdB === null) return 1;
            // Both are non-null, so compare them numerically.
            return parentIdA - parentIdB;
        }

        // Compare by prior_sibling_id (numeric, nulls first)
        const priorSiblingIdA = toInt(a.prior_sibling_id);
        const priorSiblingIdB = toInt(b.prior_sibling_id);
        if (priorSiblingIdA !== priorSiblingIdB) {
            // Logic for nulls first:
            // If a.prior_sibling_id is null, it comes first (-1).
            if (priorSiblingIdA === null) return -1;
            // If b.prior_sibling_id is null, it comes first (1).
            if (priorSiblingIdB === null) return 1;
            // Both are non-null, so compare them numerically.
            return priorSiblingIdA - priorSiblingIdB;
        }

        // If all properties are equal, maintain the original order.
        return 0;
    });

    return sortedArray;
};
