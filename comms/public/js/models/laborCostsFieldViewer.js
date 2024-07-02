import myw from 'myWorld-client';

/**
 * Viewer for labor costs fields<br/>
 * Changes string field viewer into a psedo reference set field viewer
 * @name LaborCostsFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
class LaborCostsFieldViewer extends myw.FieldViewer {
    static {
        this.prototype.tagName = 'span';
        this.prototype.className = 'relationship';

        this.prototype.events = {
            click: 'getLaborCosts'
        };
    }

    /**
     * Changes string field viewer into a psedo reference field viewer
     */
    getLaborCosts() {
        const laborCosts = this.fieldValue?.split(',') || [];
        const laborCostFeatures = [];
        // Get labor cost features
        for (const laborCost of laborCosts) {
            const urn = `mywcom_labor_cost/${laborCost}`;
            const laborCostFeature = myw.app.plugins.laborCostsManager.getLaborCostFromUrn(urn);
            if (laborCostFeature) laborCostFeatures.push(laborCostFeature);
        }

        // Set them as current features
        if (laborCostFeatures.length == 1) {
            myw.app.setCurrentFeature(laborCostFeatures[0]);
        } else {
            myw.app.setCurrentFeatureSet(laborCostFeatures);
        }
    }

    /**
     * Need to pretend this is a reference set field -> display 'items' as per reference set
     * @returns {String}
     */
    convertValue() {
        return this.msg('item_many');
    }
}

export default LaborCostsFieldViewer;
