// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class GeometryFieldViewer extends myw.FieldViewer {
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this.geometry = feature.getGeometry(fieldDD.internal_name);
        this.fieldValue = this.geometry
            ? `${this.geometry.type}(${this.geometry.flatCoordinates().length})`
            : null;
        this.fieldName = 'geometry';
        this.feature = feature;
        this.fieldDD = fieldDD;
        this.fieldName = fieldDD.internal_name;
        this.displayValue = this.fieldValue;
        this.error = this.displayValue instanceof myw.Error && this.displayValue;
        if (this.error) this.displayValue = myw.msg('errors', this.error.name);

        this.render();
    }
}
