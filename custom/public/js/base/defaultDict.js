// Copyright: IQGeo Limited 2010-2023
// Borrowed from a StackOverflow post
class DefaultDict {
    /**
     * @class Provides an equivalent for Pythons default dict.
     * Once you have finished adding to it, you should turn it into an ordinary object.
     */
    constructor(defaultInit) {
        return new Proxy(
            {},
            {
                get: (target, name) =>
                    name in target
                        ? target[name]
                        : (target[name] =
                              typeof defaultInit === 'function'
                                  ? new defaultInit().valueOf()
                                  : defaultInit)
            }
        );
    }
}

export default DefaultDict;
