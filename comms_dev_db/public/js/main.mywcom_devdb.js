// Copyright: IQGeo Limited 2010-2023
/**
 * Comms system-of-record Dev DB application
 */
import myw from 'myWorld-client';
import 'modules/comsof/js/main.mywcom';
import './models';

import CustomerConnectionPlugin from './tools/customerConnectionPlugin';
import VirtualWalkoutPlugin from './tools/virtualWalkoutPlugin';

import specsSetRule from './design_rules/specsSetRule';
import poleSpacingRule from './design_rules/poleSpacingRule';
import conduitCapacityRule from './design_rules/conduitCapacityRule';

import TestActionPlugin from './dev_tools/testActionPlugin';

import RoutePathSchematic from './schematics/route_path/routePathSchematic';
import CablePathSchematic from './schematics/cable_path/cablePathSchematic';

// Load messages
myw.localisation.loadModuleLocale('comms_dev_db');

// Set display units
myw.applicationDefinition.displayUnits.length = 'ft';

// Configure plugins
const plugins = myw.applicationDefinition.plugins;

plugins['designRulesManager'][1].rules.push(specsSetRule);
plugins['designRulesManager'][1].rules.push(poleSpacingRule);
plugins['designRulesManager'][1].rules.push(conduitCapacityRule);

plugins['customerConnection'] = CustomerConnectionPlugin;
plugins['virtualWalkout'] = VirtualWalkoutPlugin;
plugins['toolsMode'][1].toolButtons.push('strandLayout.activate');
plugins['toolsMode'][1].toolButtons.push('customerConnection.activate');
plugins['toolsMode'][1].toolButtons.push('virtualWalkout.activate');

// For demos
//plugins['schematics'][1].schematics.push(RoutePathSchematic);
//plugins['schematics'][1].schematics.push(CablePathSchematic);

plugins['test'] = TestActionPlugin;
