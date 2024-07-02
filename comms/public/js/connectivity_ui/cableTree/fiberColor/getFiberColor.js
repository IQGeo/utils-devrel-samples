// Copyright: IQGeo Limited 2010-2023

import $ from 'jquery';
const getFiberColor = fiberColor => {
    let symbols = '';

    for (const colorInfo of fiberColor.bundles) {
        const { color, abbr, stripes } = colorInfo;

        const symbol = $('<div>', { class: `fiberColorSymbol` });
        if (abbr) symbol.text(abbr);
        if (!color) {
            return;
        }

        symbol.css('background-color', color.rgbaStr(50));

        //Draw a border around white so its differentiable
        if (color.isWhite()) {
            symbol.css({
                border: '1px solid #ccc',
                height: '16px',
                'line-height': '16px'
            });
        }

        if (color.isLight(color)) symbol.css('color', 'black');

        if (stripes.length > 0) {
            symbol.css({
                'border-color': `${stripes[0]}`,
                'border-width': '2px',
                'border-style': 'solid none'
            });
        }

        symbols += symbol.get(0).outerHTML;
    }
    return symbols;
};

export default getFiberColor;
