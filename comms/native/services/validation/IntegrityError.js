//###############################################################################
// Object modelling a network integrity error
//###############################################################################
// Copyright: IQGeo Limited 2010-2023

import { MywClass } from 'myWorld-base';

/**
 * Object modelling a network integrity error
 *
 * Holds the problem record plus info on the problem details
 */
class IntegrityError extends MywClass {
    // ENH: Rename as ValidationError

    /**
     * Init slots of self
     */
    constructor(rec, field, type, ref_rec = undefined, data) {
        super();
        this.rec = rec;
        this.field = field;
        this.type = type;
        this.ref_rec = ref_rec;
        this.data = data;
    }

    /**
     * String representation of self
     */
    __repr__() {
        let res = '{} {} {}'.format(this.rec, this.field, this.type);

        if (this.ref_rec) {
            res += ' {}'.format(this.ref_rec);
        }

        return res;
    }

    /**
     *  String representations of self.data
     */
    details() {
        let res = [];
        for (const prop of this.data) {
            const val = this.data[prop];
            const item = '{}={}'.format(prop, val);
            res.push(item);
        }

        return res;
    }

    /**
     * Self as a serialisable structure
     */
    definition() {
        const defn = {};

        // Add records
        defn['feature'] = this._asGeojsonFeature(this.rec);
        defn['field'] = this.field;
        defn['type'] = this.type;

        if (this.ref_rec) {
            defn['ref_feature'] = this._asGeojsonFeature(this.ref_rec);
        }

        if (this.data) {
            const data = (defn['data'] = {});
            for (const [prop, val] of Object.entries(this.data)) {
                // if (hasattr(val, '__ident__')) val = val.__ident__();
                data[prop] = val;
            }
        }

        return defn;
    }

    /**
     * REC as serialisable structure (handling errors)
     */
    // Provided to permit display of records with broken geometry etc
    _asGeojsonFeature(rec) {
        // ENH: Replace be error handling in rec.asGeojsonFeature()

        try {
            rec.type = 'Feature';
            if (rec.geometry) delete rec.geometry.firstCoord;
            if (rec.geometry) delete rec.geometry.lastCoord;
            return rec;
        } catch (cond) {
            return {
                id: rec.id,
                myw: {
                    feature_type: rec.getType(),
                    title: rec.getTitle()
                }
            };
        }
    }
}

export default IntegrityError;
