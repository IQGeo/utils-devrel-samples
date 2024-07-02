// Utilities for string manipulation
// Copyright: IQGeo Limited 2010-2023
// ENH: Extend Core geometry API and remove these

import myw from 'myWorld-client';

/**
 * Compare 'str1' and 'str2' by alpha-numeric component
 *
 * Returns:
 *   -1:  str1 < str2
 *    0:  str1 = str2
 *    1:  str1 > str2
 */
function strCmp(str1, str2) {
    if (str1 == undefined) return -1;
    if (str2 == undefined) return 1;

    const str1Parts = strParts(str1);
    const str2Parts = strParts(str2);
    return arrayCmp(str1Parts, str2Parts);
}

/**
 * Split 'str' into its alpha-numeric components
 *
 * Returns a list of strings and numbers
 */
function strParts(str) {
    const regex = /[0-9]+/g;

    const parts = [];

    // For each numeric ..
    let ch = 0;
    for (const match of str.matchAll(regex)) {
        const numStr = match[0];
        const fstCh = match.index;
        const lstCh = fstCh + numStr.length - 1;

        // Add preceeding alpha (if there is one)
        if (ch < fstCh) {
            const alpha = str.substring(ch, fstCh);
            parts.push(alpha);
        }

        // And numeric
        parts.push(parseInt(numStr));
        ch = lstCh + 1;
    }

    // Add final alpha (if there is one)
    if (ch < str.length) {
        const alpha = str.substring(ch, str.length);
        parts.push(alpha);
    }

    return parts;
}

/**
 * Compare 'array1' and 'array2' element by element
 *
 * Returns:
 *   -1:  array1 < array2
 *    0:  array1 = array2
 *    1:  array1 > array2
 */
function arrayCmp(array1, array2) {
    const maxLen = Math.max(array1.length, array2.length);

    for (let i = 0; i < maxLen; i++) {
        if (i >= array1.length) return -1;
        if (i >= array2.length) return +1;

        if (array1[i] < array2[i]) return -1;
        if (array1[i] > array2[i]) return +1;
    }

    return 0;
}

/**
 * Zero pad integer 'n' to 'nDigits'
 */
// ENH: Move to utils
function zeroPad(n, nDigits) {
    let str = '' + n;
    return str.padStart(nDigits, '0');
}

/**
 * Gets distance string in application units
 */
function formatLengthStr(length) {
    const defaultUnit = myw.applicationDefinition.displayUnits.length;
    const lengthConfig = myw.config['core.units'].length;
    const unitScale = new myw.UnitScale(lengthConfig);
    const unit = unitScale.value(length, 'm');
    return `${unit.toString(defaultUnit)}`;
}

/**
 *
 * Gets the a formated dB string.
 *
 * @param {*} dB
 * @returns Formatted dB String
 */
function formatdBStr(dB) {
    const defaultUnit = 'dB';
    const fiberLossConfig = myw.config['core.units'].fiber_loss;
    const unitScale = new myw.UnitScale(fiberLossConfig);
    const unit = unitScale.value(dB, defaultUnit);
    return `${unit.toString(defaultUnit, {
        maximumFractionDigits: 4,
        minimumFractionDigits: 2
    })}`;
}

export { strCmp, strParts, arrayCmp, zeroPad, formatLengthStr, formatdBStr };
