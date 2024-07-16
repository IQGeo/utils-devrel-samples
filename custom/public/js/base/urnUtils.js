// Copyright: IQGeo Limited 2010-2023
// TBR: Workaround for PLAT-8804

/**
 * Decompose URN into components.
 *
 * @param {String} urn
 * @returns {Object}
 */
function decomposeUrn(urn) {
    const parts = urn.split('/');
    if (parts.length <= 2) parts.unshift('myworld');
    return {
        dsName: parts[0],
        typeInDs: parts.slice(1, -1).join('/'),
        id: parts.slice(-1)[0]
    };
}

export { decomposeUrn };
