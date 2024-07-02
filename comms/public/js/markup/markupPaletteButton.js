// Copyright: IQGeo Limited 2010-2023
import FeaturePaletteButton from '../modes/featurePaletteButton';

class MarkupPaletteButton extends FeaturePaletteButton {
    /**
     * Build UI for button
     * @returns DOM element
     */
    initUI() {
        let icon = this.getIconFor(this.model.feature_type);

        return this.$el
            .html(`<div><img src="${icon}"></div>`)
            .append(`<div>${this.model.name}</div>`);
    }
}

export default MarkupPaletteButton;
