import myw, { MywClass } from 'myWorld-base';

/**
 * Helper for logging trace messages
 */
// Provides facilities for mapping obejcts using their __ident__ method etc
class ProgressHandler extends MywClass {
    static newFor(module, max_level = 0) {
        const handler = new ProgressHandler(module, max_level);
        return handler.progress.bind(handler);
    }

    /**
     * Init slots of self
     */
    constructor(module, max_level = 0) {
        super();
        this.module = module;
        this.max_level = max_level;
    }

    /**
     * Output message (if level enabled)
     */
    progress(level, ...msg) {
        // Check for nothing to do (to avoid unnecessary work in next step)
        level -= this.max_level;
        const module_level = myw.tracing.modules[this.module] || 0;
        if (level > module_level) return;

        // Map objects to strings
        // This prevents 'cannot clone' errors from myw.trace()
        for (const i in msg) {
            msg[i] = this.asString(msg[i]);
        }

        // Show message
        myw.trace(this.module, level, ...msg);
    }

    /**
     * String representation of 'obj' (avoiding infinite recursion)
     */
    asString(obj, idents = []) {
        // Note: JavaScript dicts can't handle objects as keys (get cast to strings)
        for (const [iObj, str] of idents) {
            if (iObj === obj) return str;
        }

        const ident = [obj, ''];
        idents.push(ident);
        ident[1] = this._asString(obj, idents);

        return ident[1];
    }

    /**
     * String representation of 'obj'
     */
    _asString(obj, idents) {
        if (!obj) return obj;
        if (obj.getUrn) return obj.getUrn();
        if (obj.__ident__) return obj.__ident__();
        if (Array.isArray(obj)) return this.arrayIdent(obj, idents);
        if (typeof obj === 'object') return this.objectIdent(obj, idents);
        return obj;
    }

    /**
     * String representation of 'array'
     */
    arrayIdent(array, idents) {
        const strs = [];
        for (const v of array) {
            strs.push(this.asString(v, idents));
        }
        return '[' + strs.join(',') + ']';
    }

    /**
     * String representation of 'obj'
     */
    objectIdent(obj, idents) {
        const strs = [];
        for (let [k, v] of Object.entries(obj)) {
            if (typeof v === 'function') continue;
            if (typeof v === 'object') v = this.asString(v, idents);
            strs.push(`${k}:${v}`);
        }
        return '{' + strs.join(',') + '}';
    }
}

export default ProgressHandler;
