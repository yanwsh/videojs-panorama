// @flow

/**
 * Prints a warning in the console if it exists.
 * Disable on production environment.
 *
 * @param {String} message The warning message.
 * @returns {void}
 */
export const warning = (message: string): void => {
    //warning message only happen on develop environment
    if (process.env.NODE_ENV !== 'production') {
        if (typeof console !== "undefined" && typeof console.error === "function") {
            console.error(message);
        }

        try {
            throw new Error(message);
        } catch (e) {
        }
    }
};