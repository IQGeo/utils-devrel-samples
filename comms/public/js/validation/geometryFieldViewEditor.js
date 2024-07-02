// Copyright: IQGeo Limited 2010-2023
import { FieldEditor, Label } from 'myWorld-client';

export default class GeometryFieldEditor extends FieldEditor {
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this.geometry = feature.getGeometry(fieldDD.internal_name);
        this.fieldValue = this.geometry
            ? `${this.geometry.type}(${this.geometry.flatCoordinates().length})`
            : null;
        this.control = new Label({
            label: this.fieldValue
        });
        this.control.$el.appendTo(this.$el);
    }

    getValue() {
        return this.geometry;
    }
}
