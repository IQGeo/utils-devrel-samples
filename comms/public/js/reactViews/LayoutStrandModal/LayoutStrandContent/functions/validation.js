export const validateRows = (
    rows,
    overheadFeature,
    overheadRoute,
    undergroundFeature,
    undergroundRoute,
    useLinearAssembly,
    chosenAssembly,
    fieldData,
    setState
) => {
    // Iterate through rows then see if fieldData has data for them
    for (const index in rows) {
        const row = rows[index];
        if (!row.props.required) continue;
        if (validateOverheadFeature(row.props.name, overheadFeature, setState)) {
            return;
        }
        if (
            validateOverheadRoute(
                row.props.name,
                overheadRoute,
                useLinearAssembly,
                chosenAssembly,
                setState
            )
        ) {
            return;
        }
        if (validateUndergroundFeature(row.props.name, undergroundFeature, setState)) {
            return;
        }
        if (
            validateUndergroundRoute(
                row.props.name,
                undergroundRoute,
                useLinearAssembly,
                chosenAssembly,
                setState
            )
        ) {
            return;
        }
        if (validateAssemblies(row.props.name, chosenAssembly, setState)) {
            return;
        }
        if (validateRemainingRows(row.props.id, fieldData, setState)) {
            return;
        }
    }
    setState({ valid: true });
    return;
};

const validateOverheadFeature = (name, overheadFeature, setState) => {
    if (name !== 'overheadFeatures') return;
    if (overheadFeature === null) {
        setState({ valid: false });
        return true;
    }
    return false;
};

const validateUndergroundFeature = (name, undergroundFeature, setState) => {
    if (name !== 'undergroundFeatures') return;
    if (undergroundFeature === null) {
        setState({ valid: false });
        return true;
    }
    return false;
};

const validateOverheadRoute = (
    name,
    overheadRoute,
    useLinearAssembly,
    chosenAssembly,
    setState
) => {
    if (name !== 'overheadRoutes') return;
    if (overheadRoute === null) {
        setState({ valid: false });
        return true;
    }
    if (useLinearAssembly?.value && chosenAssembly === null) {
        setState({ valid: false });
        return true;
    }
};

const validateUndergroundRoute = (
    name,
    undergroundRoute,
    useLinearAssembly,
    chosenAssembly,
    setState
) => {
    if (name !== 'undergroundRoutes') return;
    if (undergroundRoute === null) {
        setState({ valid: false });
        return true;
    }
    if (useLinearAssembly?.value && chosenAssembly === null) {
        setState({ valid: false });
        return true;
    }
};

const validateAssemblies = (name, chosenAssembly, setState) => {
    if (name !== 'assemblies') return;
    if (chosenAssembly === null) {
        setState({ valid: false });
        return true;
    }
};

const validateRemainingRows = (id, fieldData, setState) => {
    if (
        id === 'overheadFeatures' ||
        id === 'overheadRoutes' ||
        id === 'undergroundFeatures' ||
        id === 'undergroundRoutes'
    ) {
        return false;
    }
    const data = fieldData[id]?.value;
    if (data === null || data === undefined || !data) {
        setState({ valid: false });
        return true;
    }
    return false;
};
