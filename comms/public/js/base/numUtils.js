// Copyright: IQGeo Limited 2010-2023

/**
 * Clamps value to be within min and max
 * @param {Number} value
 * @param {Number} min
 * @param {Number} max
 * @returns Clamped value
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export default clamp;
