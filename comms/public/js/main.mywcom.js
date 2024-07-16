// Copyright: IQGeo Limited 2010-2023

// ---------
//  Imports
// ---------

import myw, { DatabaseViewPlugin, SnappingPlugin, TracePlugin } from 'myWorld-client';
import 'main.standard';

// Core extensions
import './base/commsApplicationExtension';
import './api/commsDsApi';
import './validation/commsDetailsControl';
import './validation/commsResultsListControl';

import reactViewsRegistry from './base/reactViewsRegistry';
import views from './commsReactViews';
reactViewsRegistry.registerViews(views);

// Workflow support
import CommsDeltaOwnerPlugin from 'modules/comms/js/validation/commsDeltaOwnerPlugin';
import DesignChangeTrackerPlugin from 'modules/comms/js/api/designChangeTrackerPlugin';

// Network data managers
import StructureManagerPlugin from './api/structureManagerPlugin';
import EquipmentManagerPlugin from './api/equipmentManagerPlugin';
import ConduitManagerPlugin from './api/conduitManagerPlugin';
import CableManagerPlugin from './api/cableManagerPlugin';
import ConnectionManagerPlugin from './api/connectionManagerPlugin';
import CircuitManagerPlugin from './api/circuitManagerPlugin';
import FeatureModelLoaderPlugin from './models/featureModelLoaderPlugin';
import DataImportManagerPlugin from './data_import/dataImportManagerPlugin';

// Spec system
import SpecManagerPlugin from './specs/specManagerPlugin';
import SpecManagerDialogPlugin from './specs/specManagerDialog/specManagerDialogPlugin';

// Labor Costs system
import LaborCostsManagerPlugin from './labor_costs/laborCostsManagerPlugin';
import LaborCostsManagerDialogPlugin from './labor_costs/laborCostsManagerDialog/laborCostsManagerDialogPlugin';

// Network Editing GUI components
import EquipmentTreePlugin from './connectivity_ui/equipmentTreePlugin';
import CableTreePlugin from './connectivity_ui/cableTreePlugin';
import StructureModePlugin from './modes/structureModePlugin';
import EquipmentModePlugin from './modes/equipmentModePlugin';
import ToolsModePlugin from './modes/toolsModePlugin';
import DisplayManagerPlugin from './connectivity_ui/displayManagerPlugin';
import DigitisingLengthPlugin from './base/digitisingLengthPlugin';
import CommsCreateFeaturePlugin from './plugins/commsCreateFeaturePlugin';

// Bulk Move
import BulkMoveModePlugin from './modes/bulkMoveModePlugin';

// Schematics
import SchematicsPlugin from './schematics/schematicsPlugin';
import PinTraceSchematic from './schematics/pin_trace/pinTraceSchematic';
import StructureConnectivitySchematic from './schematics/structure_connectivity/structureConnectivitySchematic';

// Reports Framwork
import ReportingPlugin from './reporting/reportManagerPlugin';
import HtmlReportStream from './reporting/streams/htmlReportStream';
import CsvReportStream from './reporting/streams/csvReportStream';
import PdfReportStream from './reporting/streams/pdfReportStream';
import XlsxReportStream from './reporting/streams/xlsxReportStream';

// Reports
import ConnectivityReport from './reporting/connectivityReport';
import EquipmentReport from './reporting/equipmentReport';
import FiberReport from './reporting/fiberReport';
import CircuitReport from './reporting/circuitReport';
import EquipCircuitReport from './reporting/equipmentCircuitReport';
import LoopMakeupReport from './reporting/loopMakeupReport';
import SpliceReport from './reporting/spliceReport';
import ValidationReport from './reporting/validationReport';
import FeatureChangeReport from './reporting/featureChangeReport';
import FeatureSetReport from './reporting/featureSetReport';
import TraceReport from './reporting/traceReport';
import FiberTraceReport from './reporting/fiberTraceReport';
import BOMReport from './reporting/bomReport';
import CopperTraceReport from './reporting/copperTraceReport';
import CoaxTraceReport from './reporting/coaxTraceReport';

// User Groups
import UserGroupManagerDialogPlugin from './user_groups/userGroupManagerDialogPlugin';
import UserGroupManagerPlugin from './api/userGroupManagerPlugin';

// Design lifecycle
import StateManagerPlugin from './modes/stateManagerPlugin';
import ValidationPlugin from './validation/validationPlugin';
import DesignRulesManagerPlugin from './validation/designRulesManagerPlugin';

// Design Markup
import './markup/markupFeature';
import './markup/markupVectorLayer';
import MarkupModePlugin from './markup/markupModePlugin';
import PathfinderModePlugin from './pathfinder/pathfinderModePlugin';

// Layout Strand
import LayoutStrandPlugin from './strand_layout/strandLayoutPlugin';

// Line of count support
import LOCManagerPlugin from './line_of_count/locManagerPlugin';

import AddMarkerPlugin from './plugins/addMarkerPlugin';

import ShowObjectsREST from './ShowObjectsREST';
import { StructureCheckerPlugin } from './StructureChecker/structureCheckerPlugin';

// Messages
//myw.localisation.loadModuleLocale('workflow');
myw.localisation.loadModuleLocale('comms');

// ------------------
//  Register Plugins
// ------------------
const plugins = myw.applicationDefinition.plugins;

// Workflow
plugins['databaseView'] = DatabaseViewPlugin;
plugins['workflow'] = CommsDeltaOwnerPlugin;
plugins['designChangeTracker'] = DesignChangeTrackerPlugin;

// Network data managers
plugins['structureManager'] = StructureManagerPlugin;
plugins['conduitManager'] = ConduitManagerPlugin;
plugins['equipmentManager'] = EquipmentManagerPlugin;
plugins['cableManager'] = CableManagerPlugin;
plugins['connectionManager'] = ConnectionManagerPlugin;
plugins['locManager'] = LOCManagerPlugin;
plugins['circuitManager'] = CircuitManagerPlugin;
plugins['featureModelLoader'] = FeatureModelLoaderPlugin;
plugins['dataImportManager'] = DataImportManagerPlugin;
plugins['displayManager'] = DisplayManagerPlugin;

// Spec system
plugins['specManager'] = SpecManagerPlugin;
plugins['specManagerDialog'] = SpecManagerDialogPlugin;

// Labor Costs system
plugins['laborCostsManager'] = LaborCostsManagerPlugin;
plugins['laborCostsManagerDialog'] = LaborCostsManagerDialogPlugin;

// User Groups
plugins['userGroupManagerDialog'] = UserGroupManagerDialogPlugin;
plugins['userGroupManager'] = UserGroupManagerPlugin;

// Layout Strand
plugins['layoutStrand'] = LayoutStrandPlugin;

// Move Mode Plugin
plugins['bulkMoveMode'] = BulkMoveModePlugin;

// Network Editing GUI components
plugins['structureMode'] = [StructureModePlugin, { autoSave: false }];
plugins['equipmentMode'] = [EquipmentModePlugin, { autoSave: false }];
plugins['markupMode'] = [MarkupModePlugin, { autoSave: false }];
plugins['pathfinderMode'] = PathfinderModePlugin;
plugins['toolsMode'] = [
    ToolsModePlugin,
    {
        toolButtons: [
            'specManagerDialog.dialog',
            'laborCostsManagerDialog.dialog',
            'validation.dialog',
            'userGroupManagerDialog.dialog',
            'layoutStrand.dialog',
            'pathfinderMode.toggle'
        ]
    }
];
plugins['equipmentTree'] = EquipmentTreePlugin;
plugins['cableTree'] = CableTreePlugin;
plugins['digitisingLength'] = DigitisingLengthPlugin;
plugins['trace'] = myw.TracePlugin;
plugins['snapping'] = myw.SnappingPlugin;

// Schematics
plugins['schematics'] = [
    SchematicsPlugin,
    {
        schematics: [PinTraceSchematic, StructureConnectivitySchematic]
    }
];

// Core plugin override
plugins['createFeature'] = CommsCreateFeaturePlugin;

// Reporting (prettier-ignore is workaround for Core issue 22752)
// prettier-ignore
plugins['reportManager'] = [
    ReportingPlugin,
    {
        outputFormats: {
            pdf: PdfReportStream,
            html: HtmlReportStream,
            xlsx: XlsxReportStream,
            csv: CsvReportStream
        },

        // Reports that can be built for a single feature
        featureReports: {
            'connectivityReport': ConnectivityReport,
            'equipmentReport': EquipmentReport,
            'fiberReport': FiberReport,
            'circuitReport': CircuitReport,
            'equipCircuitReport': EquipCircuitReport,
            'loopMakeupReport': LoopMakeupReport,
            'spliceReport': SpliceReport
        },

        // Reports that can be built for a feature set (order is important)
        featureSetReports: {
            'coaxTraceReport': CoaxTraceReport,
            'copperTraceReport': CopperTraceReport,
            'fiberTraceReport': FiberTraceReport,
            'traceReport': TraceReport,
            'validationReport': ValidationReport,
            'featureChangeReport': FeatureChangeReport,
            'featureSetReport': FeatureSetReport
        },

        // Reports that can be built for a delta owner
        designReports: {
            'bomReport': BOMReport
        }
    }
];

// Design lifecycle
plugins['stateManager'] = [
    StateManagerPlugin,
    {
        managedPlugins: [
            'equipmentMode',
            'structureMode',
            'toolsMode',
            'markupMode',
            'workflow',
            'pathfinderMode'
        ]
    }
];
plugins['validation'] = ValidationPlugin;
plugins['designRulesManager'] = [DesignRulesManagerPlugin, { rules: [] }];

// Fiber monitoring system (FMS) integration
plugins['addMarker'] = AddMarkerPlugin;

plugins['showObjectsRest'] = ShowObjectsREST;
plugins['structureCheckerPlugin'] = StructureCheckerPlugin;

// Enable record level operations on feature changes and conflicts
myw.ResultsListControl.prototype.recordOperationsEnabled = false;

// ---------------
//  Configure GUI
// ---------------

// Set custom field viewers for connectivity fields
myw.FeatureViewer.prototype.fieldViewerMapping.reference = myw.ReferenceTooltipFieldViewer;
myw.FeatureViewer.prototype.fieldViewerMapping.reference_set = myw.ReferenceSetTooltipFieldViewer;

// Configure desktop layout
const desktopLayoutDef = myw.applicationDefinition.layouts.desktop;
const desktopToolbarButtons = desktopLayoutDef.controls.toolbar[1].buttons;
desktopToolbarButtons.push(
    'trace.dialog',
    'schematics.toggleView',
    'toolsMode.toggle',
    'structureMode.toggle',
    'equipmentMode.toggle',
    'markupMode.toggle',
    'showObjectsRest.dialog',
    'structureCheckerPlugin.dialog'
);

const detailsControl = desktopLayoutDef.controls.tabControl[1].tabs.find(x => x.id === 'details')
    .control[1];
detailsControl.pluginIds.unshift('equipmentTree', 'cableTree');
detailsControl.resultsButtons.splice(5, 0, 'reportManager.exportCurrentSet'); //Put report button left of zoom to in results list buttons
detailsControl.resultsButtons.splice(6, 0, 'bulkMoveMode.toggle');

detailsControl.pluginIds.splice(1, 0, 'workflow');

// Add link to user guide
const helpPanelControl = desktopLayoutDef.controls.tabControl[1].tabs[2].control[1];

helpPanelControl['user_guides'] = [
    ['comms_guide', '/modules/comms/doc/NMTelecomUserGuide/index.html']
];
