// Copyright: IQGeo Limited 2010-2023
import ConduitEditor from './conduitEditor';
import NetworkFeature from './networkFeature';

export default class Conduit extends NetworkFeature {
    static {
        this.prototype.editorClass = ConduitEditor;
    }

    // Fields that cannot be changed in editor
    readonlyFields() {
        return [
            'housing',
            'root_housing',
            'in_structure',
            'out_structure',
            'in_conduit',
            'out_conduit',
            'forward',
            'conduit_run'
        ];
    }

    // Cables directly inside self
    async cables() {
        return this.datasource.comms.cablesOf(this);
    }

    // Chain of conduits of which self is a part
    async continuousConduits() {
        return this.datasource.comms.continuousConduits(this);
    }
}
