// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin, latLngBounds } from 'myWorld-client';
import TestReport from './testReport';
import PinRange from '../../../../comms/public/js/api/pinRange';
import SpecReport from '../../../../comms/public/js/reporting/specReport';

export default class TestActionPlugin extends Plugin {
    /**
     * Allows pre-canned action to be performed after application loads (to assist testing)
     *
     * Action is specified by passing arg in application URL eample: ?test=schematic:structure_4
     *
     */

    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
    }

    /**
     * Set self's state from URL param actionStr
     */
    setStateFromAppLink(actionStr) {
        const parts = actionStr.split(':');

        switch (parts[0]) {
            case 'schematic': {
                this.doSchematicsAction(parts[1]);
                break;
            }
            case 'select': {
                this.doSelectAction(parts[1]);
                break;
            }

            case 'insert': {
                this.doInsertAction(parts[1]);
                break;
            }

            case 'transaction': {
                this.doTransactionAction();
                break;
            }

            case 'conflicts': {
                this.doConflictsAction(`design/${parts[1]}`);
                break;
            }

            case 'report': {
                this.doReportAction(parts[1]);
                break;
            }

            case 'import': {
                this.doImportAction(parts[1]);
                break;
            }

            case 'layoutStrand': {
                this.doLayoutStrandAction();
                break;
            }
        }
    }

    // -----------------------------------------------------------------------------
    //                                 GENERIC ACTIONS
    // -----------------------------------------------------------------------------

    async doSelectAction(urn) {
        const feature = await this.app.database.getFeatureByUrn(urn);
        this.app.setCurrentFeature(feature, { zoomTo: true });

        console.log(feature.geometry);
    }

    // -----------------------------------------------------------------------------
    //                                 INSERT ACTIONS
    // -----------------------------------------------------------------------------

    async doInsertAction(name) {
        // Insert object
        const [ft, id] = await this.doInsert(name);

        // Select it
        const urn = `${ft}/${id}`;
        const feature = await this.app.database.getFeatureByUrn(urn);
        this.app.setCurrentFeature(feature, { zoomTo: true });
    }

    /**
     * Insert record. Returns [feature_type,id]
     */
    async doInsert(name) {
        switch (name) {
            case 'pole_1': {
                // Free-standing pole
                const detFeature = await this.ds.createDetachedFeature('pole');
                detFeature.setGeometry('Point', [0.137242, 52.22553]);
                const id = await this.ds.comms.insertFeature(detFeature);
                return ['pole', id];
            }

            case 'pole_2': {
                // Pole splitting route
                const detFeature = await this.ds.createDetachedFeature('pole');
                detFeature.setGeometry('Point', [0.1372422491036751, 52.22553559170557]);
                const id = await this.ds.comms.insertFeature(detFeature);
                return ['pole', id];
            }

            case 'cable_1': {
                const detFeature = await this.ds.createDetachedFeature('fiber_cable');
                detFeature.setGeometry('LineString', [
                    [0.136870443821, 52.225613875625555],
                    [0.1376285755148, 52.2253197416276]
                ]);
                const id = await this.ds.comms.insertFeature(detFeature);
                return ['fiber_cable', id];
            }
        }

        throw 'Unknown subtest: ${name}';
    }

    async doTransactionAction() {
        const tr = this.ds.transaction();

        const detFeature = await this.ds.createDetachedFeature('pole');
        detFeature.setGeometry('Point', [0.1372422491036751, 52.22553559170557]);

        tr.addInsert(detFeature);

        const result = await this.ds.comms.runTransaction(tr);

        const urn = `${detFeature.getType()}/${result.ids[0]}`;
        const feature = await this.app.database.getFeatureByUrn(urn);
        this.app.setCurrentFeature(feature, { zoomTo: true });
    }

    // -----------------------------------------------------------------------------
    //                                 SCHEMATICS ACTIONS
    // -----------------------------------------------------------------------------

    /**
     * Show a schematic
     */
    async doSchematicsAction(name) {
        const plugin = this.app.plugins['schematics'];

        const data = await this.getSchematicsData(name);
        if (data) {
            if (data.length == 1) {
                this.app.setCurrentFeature(data[0]);
            } else {
                this.app.setCurrentFeatureSet(data);
            }
        }

        plugin.toggleView();
        plugin.testMode = true;
    }

    /**
     * Get data to select
     */
    async getSchematicsData(name) {
        switch (name) {
            case 'fiber_trace_1': {
                const opts = { resultType: 'tree', direction: 'both' };
                const url = 'fiber_patch_panel/1?pins=out:1:5';
                return this.ds.traceOut('mywcom_fiber', url, opts);
            }

            case 'fiber_trace_2': {
                const opts = { resultType: 'tree', direction: 'both' };
                const url = 'mywcom_fiber_segment/61?pins=in:1:144';
                return this.ds.traceOut('mywcom_fiber', url, opts);
            }

            case 'fiber_trace_3': {
                const opts = { resultType: 'tree', direction: 'upstream' };
                const url = 'fiber_ont/5?pins=in:1';
                return this.ds.traceOut('mywcom_fiber', url, opts);
            }

            case 'fiber_trace_4': {
                const opts = { resultType: 'tree', direction: 'downstream' };
                const url = 'fiber_patch_panel/1?pins=out:1:5';
                return this.ds.traceOut('mywcom_fiber', url, opts);
            }

            case 'fiber_trace_5': {
                const opts = { resultType: 'tree', direction: 'upstream' };
                const url = 'fiber_ont/146?pins=in:1';
                return this.ds.traceOut('mywcom_fiber', url, opts);
            }

            case 'route_path_1': {
                const opts = { resultType: 'tree' };
                const feature = await this.ds.getFeatureByUrn('manhole/48');
                return this.ds.shortestPath('mywcom_routes', feature, 'manhole/36', opts);
            }

            case 'route_path_2': {
                const opts = { resultType: 'tree' };
                const feature = await this.ds.getFeatureByUrn('building/1');
                return this.ds.shortestPath('mywcom_routes', feature, 'wall_box/43', opts);
            }

            case 'cable_1': {
                const feature = await this.ds.getFeatureByUrn('fiber_cable/6');
                return [feature];
            }

            case 'structure_1': {
                // Simple cabinet with passthrough cable + connections
                const feature = await this.app.database.getFeatureByUrn('cabinet/2');
                return [feature];
            }

            case 'structure_2': {
                // Has undirected cable and slacks
                const feature = await this.app.database.getFeatureByUrn('manhole/28');
                return [feature];
            }

            case 'structure_3': {
                // Has undirected cable with loop
                const feature = await this.app.database.getFeatureByUrn('manhole/89');
                return [feature];
            }

            case 'structure_4': {
                // Complex internals
                const feature = await this.app.database.getFeatureByUrn('building/1');
                return [feature];
            }

            case 'cable_set_1': {
                const filter = '[fiber_count]>4';
                const bounds = latLngBounds([52.2238776, 0.1362367], [52.2244724, 0.13689]);
                return this.ds.getFeatures('fiber_cable', { filter: filter, bounds: bounds });
            }
        }
    }

    // -----------------------------------------------------------------------------
    //                                 CONFLICTS ACTIONS
    // -----------------------------------------------------------------------------

    /**
     * Show conflicts
     */
    async doConflictsAction(design) {
        const validationPlugin = this.app.plugins['validation'];
        await this.app.setDelta(design);

        const dialog = await validationPlugin.checkDesignDialog();
        await dialog.open();
        await dialog.runValidation();
        dialog.close();
    }

    // -----------------------------------------------------------------------------
    //                                 REPORT ACTIONS
    // -----------------------------------------------------------------------------

    /**
     * Show report
     */
    async doReportAction(name) {
        const reportMgr = this.app.plugins.reportManager;
        const connectionManager = this.app.plugins.connectionManager;

        const ConnectivityReport = reportMgr.featureReports.connectivityReport;
        const EquipmentReport = reportMgr.featureReports.equipmentReport;
        const FiberReport = reportMgr.featureReports.fiberReport;
        const CircuitReport = reportMgr.featureReports.circuitReport;
        const EquipCircuitReport = reportMgr.featureReports.equipCircuitReport;
        const TerminationReport = reportMgr.featureReports.terminationReport;
        const EquipTerminationReport = reportMgr.featureReports.equipTerminationReport;

        const ValidationReport = reportMgr.featureSetReports.validationReport;
        const FeatureChangeReport = reportMgr.featureSetReports.featureChangeReport;
        const FeatureSetReport = reportMgr.featureSetReports.featureSetReport;
        const TraceReport = reportMgr.featureSetReports.traceReport;
        const FiberTraceReport = reportMgr.featureSetReports.fiberTraceReport;
        const BOMReport = reportMgr.featureSetReports.bomReport;

        let enc, rep;
        let formats = [];

        // Build report object
        switch (name) {
            case 'html_stream': {
                rep = new TestReport(this.app);
                break;
            }

            case 'pdf_stream': {
                rep = new TestReport(this.app);
                formats = ['pdf'];
                break;
            }

            case 'csv_stream': {
                rep = new TestReport(this.app);
                formats = ['csv'];
                break;
            }

            case 'connectivity_1': {
                enc = await this.app.database.getFeatureByUrn('cabinet/2'); // Simple splice
                rep = new ConnectivityReport(this.app, enc);
                break;
            }

            case 'connectivity_2': {
                enc = await this.app.database.getFeatureByUrn('manhole/29'); // Splice in trays
                rep = new ConnectivityReport(this.app, enc);
                break;
            }

            case 'connectivity_3': {
                enc = await this.app.database.getFeatureByUrn('pole/6'); // Cable -> 2 splitters
                rep = new ConnectivityReport(this.app, enc);
                break;
            }

            case 'connectivity_4': {
                enc = await this.app.database.getFeatureByUrn('building/1'); // Racks etc
                rep = new ConnectivityReport(this.app, enc);
                formats = ['pdf'];
                break;
            }

            case 'connectivity_5': {
                enc = await this.app.database.getFeatureByUrn('splice_closure/37');
                rep = new ConnectivityReport(this.app, enc);
                formats = ['pdf'];
                break;
            }

            case 'equipment_1': {
                enc = await this.app.database.getFeatureByUrn('building/1');
                rep = new EquipmentReport(this.app, enc);
                break;
            }

            case 'conflict_1': {
                const design = 'design/NB335';
                await this.doConflictsAction(design);
                const delta = await this.app.database.getFeatureByUrn(design);
                const conflicts = this.app.currentFeatureSet.items;
                rep = new ValidationReport(this.app, conflicts, delta);
                break;
            }

            case 'conflict_2': {
                const design = 'systest/conflicts1';
                await this.doConflictsAction(design);
                const delta = await this.app.database.getFeatureByUrn(design);
                const conflicts = this.app.currentFeatureSet.items;
                rep = new ValidationReport(this.app, conflicts, delta);
                break;
            }

            case 'changes_1': {
                const design = 'design/NB335';
                const delta = await this.app.database.getFeatureByUrn(design);
                const changes = await this.ds.comms.deltaChanges(design);
                rep = new FeatureChangeReport(this.app, changes, delta);
                break;
            }

            case 'set_1': {
                const latLngBounds = new latLngBounds(
                    [0.1363802, 52.2252737],
                    [0.1380915, 52.2259523]
                );
                this.app.map.setZoom(20);
                const features = await this.app.map.selectBox(latLngBounds);
                rep = new FeatureSetReport(this.app, features);
                break;
            }

            case 'trace_1': {
                const feature = await this.app.database.getFeatureByUrn('fiber_patch_panel/1');
                const pins = { spec: 'in:1' };
                const direction = 'both';

                const res = await connectionManager.traceOut('fiber', feature, pins, direction);
                this.app.setCurrentFeatureSet(res);

                rep = new TraceReport(this.app, res.items);
                break;
            }

            case 'trace_2': {
                const feature = await this.app.database.getFeatureByUrn('fiber_patch_panel/1');
                const pins = { spec: 'in:1' };
                const direction = 'upstream';

                const res = await connectionManager.traceOut('fiber', feature, pins, direction);
                this.app.setCurrentFeatureSet(res);

                rep = new TraceReport(this.app, res.items);
                break;
            }

            case 'trace_3': {
                const feature = await this.app.database.getFeatureByUrn('fiber_patch_panel/1');
                const pins = { spec: 'in:1' };
                const direction = 'downstream';

                const res = await connectionManager.traceOut('fiber', feature, pins, direction);
                this.app.setCurrentFeatureSet(res);

                rep = new TraceReport(this.app, res.items);
                break;
            }

            case 'trace_4': {
                const feature = await this.app.database.getFeatureByUrn('fiber_patch_panel/1');
                const pins = { spec: 'in:1' };
                const direction = 'both';

                const res = await connectionManager.traceOut('fiber', feature, pins, direction);
                res.type = 'fiber';
                this.app.setCurrentFeatureSet(res);

                rep = new FiberTraceReport(this.app, res.items);
                break;
            }

            case 'bom_1': {
                const design = 'design/NB335';
                const delta = await this.app.database.getFeatureByUrn(design);
                const changes = await this.ds.comms.deltaChanges(design);
                rep = new BOMReport(this.app, changes, delta);
                break;
            }

            case 'bom_2': {
                const design = 'design/NB112';
                const delta = await this.app.database.getFeatureByUrn(design);
                const changes = await this.ds.comms.deltaChanges(design);
                rep = new BOMReport(this.app, changes, delta);
                break;
            }

            case 'fiber_1': {
                const route = await this.app.database.getFeatureByUrn('ug_route/6');
                rep = new FiberReport(this.app, route);
                break;
            }

            case 'fiber_2': {
                const seg = await this.app.database.getFeatureByUrn('mywcom_fiber_segment/382');
                rep = new FiberReport(this.app, seg);
                break;
            }

            case 'circuit_1': {
                const seg = await this.app.database.getFeatureByUrn('mywcom_fiber_segment/382');
                rep = new CircuitReport(this.app, seg);
                break;
            }

            case 'circuit_2': {
                const rotue = await this.app.database.getFeatureByUrn('ug_route/6');
                rep = new CircuitReport(this.app, rotue);
                break;
            }

            case 'equip_circuit_1': {
                const building = await this.app.database.getFeatureByUrn('building/1');
                rep = new EquipCircuitReport(this.app, building);
                break;
            }

            case 'equip_circuit_2': {
                const building = await this.app.database.getFeatureByUrn('fiber_patch_panel/1');
                rep = new EquipCircuitReport(this.app, building);
                break;
            }

            case 'equip_circuit_3': {
                const building = await this.app.database.getFeatureByUrn('fiber_patch_panel/5');
                rep = new EquipCircuitReport(this.app, building);
                break;
            }

            case 'termination_1': {
                const cable = await this.app.database.getFeatureByUrn('mywcom_fiber_segment/184');
                cable.pins = new PinRange('in', 1, 288);
                rep = new TerminationReport(this.app, cable);
                break;
            }

            case 'termination_2': {
                const route = await this.app.database.getFeatureByUrn('ug_route/6');
                rep = new TerminationReport(this.app, route);
                break;
            }

            case 'termination_3': {
                const cable = await this.app.database.getFeatureByUrn('mywcom_fiber_segment/184');
                cable.pins = new PinRange('in', 1, 45);
                rep = new TerminationReport(this.app, cable);
                break;
            }

            case 'equip_termination_1': {
                const patch_panel = await this.app.database.getFeatureByUrn('fiber_patch_panel/5');
                patch_panel.pins = new PinRange('in', 1, 288);
                rep = new EquipTerminationReport(this.app, patch_panel);
                break;
            }

            case 'equip_termination_2': {
                const building = await this.app.database.getFeatureByUrn('building/1');
                rep = new EquipTerminationReport(this.app, building);
                break;
            }

            case 'equip_termination_3': {
                const tray = await this.app.database.getFeatureByUrn('fiber_splice_tray/25');
                rep = new EquipTerminationReport(this.app, tray);
                break;
            }

            case 'equip_termination_4': {
                const manhole = await this.app.database.getFeatureByUrn('manhole/32');
                rep = new EquipTerminationReport(this.app, manhole);
                break;
            }

            case 'equip_termination_5': {
                const manhole = await this.app.database.getFeatureByUrn('manhole/253');
                rep = new EquipTerminationReport(this.app, manhole);
                break;
            }

            case 'spec_1': {
                const specs = await this.app.database.getFeatures('fiber_cable_spec');
                rep = new SpecReport(this.app, specs);
                break;
            }
        }

        // Display it
        await rep.build();
        reportMgr.preview(rep.title(), rep);

        // Download it
        for (const format of formats) {
            reportMgr.output(rep.title(), rep, format);
        }
    }

    // -----------------------------------------------------------------------------
    //                                 IMPORT ACTIONS
    // -----------------------------------------------------------------------------

    /**
     * Open import dialog
     */
    async doImportAction(name) {
        const urn = 'design/NB112';
        const feature = await this.app.database.getFeatureByUrn(urn);
        this.app.setCurrentFeature(feature, { zoomTo: false });
        const dialog = await this.app.plugins.dataImportManager.showImportDialog();

        // TODO: Select a file
        dialog.formatItem.setValue('cdif');
    }

    // -----------------------------------------------------------------------------
    //                                 Layout Strand ACTIONS
    // -----------------------------------------------------------------------------

    /**
     * Open layout Strand Dialog
     */
    async doLayoutStrandAction() {
        const urn = 'design/CC4970';
        this.app.setDelta(urn);
        this.app.plugins.toolsMode.enable();
        await myw.Util.delay(1000);
        this.app.plugins.layoutStrand.showDialog();
    }
}
