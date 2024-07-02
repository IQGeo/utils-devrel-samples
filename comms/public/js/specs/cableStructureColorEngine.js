import myw, { MywClass } from 'myWorld-client';
import FiberColor from './fiberColor';
import Color from '../base/color';

export default class CableStructureColorEngine extends MywClass {
    static {
        this.prototype.messageGroup = 'CableStructureColorEngine';
    }

    getColors(cableStructure) {
        if (!cableStructure) return null;

        const colorDefinitions = myw.config['mywcom.fiberColors'];

        // Get the bundle definitions at each level of the cable structure
        const bundlesByLevel = [];
        cableStructure.forEach(level => {
            const colorScheme = myw.config['mywcom.fiberColorSchemes'][level.colorScheme];

            const colors = colorScheme.colors.slice(0, level.bundleSize);

            const bundles = colors.map((colorInfo, index) => {
                let colorDef = colorDefinitions[colorInfo.color];
                let abbr = colorDef.abbr;
                let label = colorDef.label;
                let stripeColors = [];

                if (colorInfo.stripes && colorInfo.stripes.length) {
                    stripeColors = colorInfo.stripes.map(
                        colorName => colorDefinitions[colorName].color
                    );

                    abbr = colorInfo.stripes
                        .map(colorName => colorDefinitions[colorName].abbr)
                        .join('/');
                    abbr = [colorDef.abbr, abbr].join('/');

                    //ENH: Currently only supports 1 stripe
                    let firstStripeDef = colorDefinitions[colorInfo.stripes[0]];
                    label = this.msg('stripe_label', {
                        color: colorDef.label,
                        stripe: firstStripeDef.label
                    });
                }

                return {
                    color: Color.fromHex(colorDef.color),
                    stripes: stripeColors,
                    abbr: abbr,
                    label: label,
                    bundleType: level.bundleType,
                    position: index + 1
                };
            });

            bundlesByLevel.push(bundles);
        }, this);

        // Cartesian Product of all cable structure levels
        let bundleAddresses = bundlesByLevel.shift().map(itm => [itm]);
        bundlesByLevel.forEach(bundlesAtLevel => {
            const newAddresses = [];
            bundleAddresses.forEach(oldAddress => {
                bundlesAtLevel.forEach(bndl => {
                    let newArray = oldAddress.slice();
                    newArray.push(bndl);
                    newAddresses.push(newArray);
                });
            });
            bundleAddresses = newAddresses;
        });

        // Convert bundle definitions to FiberColors indexed by pin index
        let colors = {};
        bundleAddresses.forEach((ba, index) => {
            colors[index + 1] = new FiberColor(ba);
        });
        return colors;
    }
}
