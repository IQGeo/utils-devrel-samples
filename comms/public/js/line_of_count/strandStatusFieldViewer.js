import myw from 'myWorld-client';

class StrandStatusFieldViewer extends myw.FieldViewer {
    convertValue(value) {
        const locManager = myw.app.plugins.locManager;
        return locManager.formattedLoc(this.feature);
    }
}

myw.StrandStatusFieldViewer = StrandStatusFieldViewer;
