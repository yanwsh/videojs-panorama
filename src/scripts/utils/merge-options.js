// @flow

/**
 * code adopt from https://github.com/videojs/video.js/blob/master/src/js/utils/merge-options.js
 */

/**
 * Returns whether a value is an object of any kind - including DOM nodes,
 * arrays, regular expressions, etc. Not functions, though.
 *
 * This avoids the gotcha where using `typeof` on a `null` value
 * results in `'object'`.
 *
 * @param  {Object} value
 * @return {Boolean}
 */
export function isObject(value: any) {
    return !!value && typeof value === 'object';
}

/**
 * Returns whether an object appears to be a "plain" object - that is, a
 * direct instance of `Object`.
 *
 * @param  {Object} value
 * @return {Boolean}
 */
export function isPlain(value: any) {
    return isObject(value) &&
        toString.call(value) === '[object Object]' &&
        value.constructor === Object;
}

export const mergeOptions = (...sources: any): any => {
    let results = {};
    sources.forEach((values)=>{
        if (!values) {
            return;
        }

        Object.getOwnPropertyNames(values).forEach((key)=>{
            let value = values[key];
            if (!isPlain(value)) {
                results[key] = value;
                return;
            }

            if (!isPlain(results[key])) {
                results[key] = {};
            }

            results[key] = mergeOptions(results[key], value);
        });
    });

    return results;
};