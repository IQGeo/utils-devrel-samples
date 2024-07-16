// Collection utilities

/**
 * The first key of 'dict' that has value 'val'
 */
const keyOf = function (val, dict) {
    for (const key in dict) {
        if (dict[key] == val) return key;
    }
};

/**
 * True if arr1 and arr2 are identical else false
 */
const arrayEqual = function (arr1, arr2) {
    if (arr1.length != arr2.length) return false;

    for (const i in arr1) {
        if (arr1[i] !== arr2[i]) return false;
    }

    return true;
};

export { keyOf, arrayEqual };
