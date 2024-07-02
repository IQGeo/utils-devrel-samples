import json
from myworldapp.modules.comsof.server.sync.comsof_ws import ComsofWS

infos = {
     'IN_AccessStructures': { 'external_name': 'IN Access Structure',  'key': 'eq_id',  'title': 'IN [type]: [eq_id]', 'short_description': '[type]' },
     'IN_AerialConnections': { 'external_name': 'IN Aerial Connection' },
     'IN_AerialDropConnections': { 'external_name': 'IN Aerial Drop Connection' },
     'IN_Buildings': { 'external_name': 'IN Building',  'key': 'bldg_id' },
     'IN_CentralOffice': { 'external_name': 'IN Central Office' },
     'IN_Crossings': { 'external_name': 'IN Crossing' },
     'IN_DemandPoints': { 'external_name': 'IN Demand Point', 'editable': True },
     'IN_DropTrenches': { 'external_name': 'IN Drop Trench' },
     'IN_ExistingCables': { 'external_name': 'IN Existing Cable' },
     'IN_ExistingPipes': { 'external_name': 'IN Existing Pipe' },
     'IN_FacadeDropLines': { 'external_name': 'IN Facade Drop Line' },
     'IN_FacadeLines': { 'external_name': 'IN Facade Line' },
     'IN_HomePoints': { 'external_name': 'IN Home Point' },
     'IN_NonFiberCables': { 'external_name': 'IN Non Fiber Cable' },
     'IN_NonFiberEquipment': { 'external_name': 'IN Non Fiber Equipment' },
     'IN_Poles': { 'external_name': 'IN Pole' },
     'IN_PolygonBoundaries': { 'external_name': 'IN Polygon Boundary' },
     'IN_PossibleTrenches': { 'external_name': 'IN Possible Trench' },
     'IN_StreetCenterLines': { 'external_name': 'IN Street Centerline' },
     'IN_Transitions': { 'external_name': 'IN Transition' },
     
     'IN_BOM_SubAreas': { 'external_name': 'IN BOM SubArea' },
     'IN_Boundaries': { 'external_name': 'IN Boundary' },
     'IN_RollOutPhases': { 'external_name': 'IN Roll Out Phase' },
     'IN_RulesPolygons': { 'external_name': 'IN Rules Polygon' },


     'IN_ForcedBackBoneCableClusters': { 'external_name': 'IN Backbone Cable Cluster',  'key': 'agg_id' },
     'IN_ForcedBackBoneCables': { 'external_name': 'IN Backbone Cable' },
     'IN_ForcedBackBoneClusters': { 'external_name': 'IN Backbone Cluster',  'key': 'agg_id' },
     'IN_ForcedBackBonePoints': { 'external_name': 'IN Backbone Point' },
     'IN_ForcedBackBoneRoutes': { 'external_name': 'IN Backbone Route' },
     
     'IN_ForcedPrimaryDistributionCableClusters': { 'external_name': 'IN Primary Distribution Cable Cluster',  'key': 'agg_id' },
     'IN_ForcedPrimaryDistributionCables': { 'external_name': 'IN Primary Distribution Cable' },
     'IN_ForcedPrimaryDistributionClusters': { 'external_name': 'IN Primary Distribution Cluster',  'key': 'agg_id' },
     'IN_ForcedPrimaryDistributionPoints': { 'external_name': 'IN Primary Distribution Point' },
     'IN_ForcedPrimaryDistributionRoutes': { 'external_name': 'IN Primary Distribution Route' },
      
     'IN_ForcedDistributionCableClusters': { 'external_name': 'IN Distribution Cable Cluster',  'key': 'agg_id' },
     'IN_ForcedDistributionCables': { 'external_name': 'IN Distribution Cable' },
     'IN_ForcedDistributionClusters': { 'external_name': 'IN Distribution Cluster',  'key': 'agg_id', 'editable': True },
     'IN_ForcedDistributionPoints': { 'external_name': 'IN Distribution Point' },
     'IN_ForcedDistributionRoutes': { 'external_name': 'IN Distribution Route' },
     
     'IN_ForcedFeederCableClusters': { 'external_name': 'IN Feeder Cable Cluster',  'key': 'agg_id' },
     'IN_ForcedFeederCables': { 'external_name': 'IN Feeder Cable' },
     'IN_ForcedFeederClusters': { 'external_name': 'IN Feeder Cluster',  'key': 'agg_id' },
     'IN_ForcedFeederPoints': { 'external_name': 'IN Feeder Point' },
     'IN_ForcedFeederRoutes': { 'external_name': 'IN Feeder Route' },
       
     'IN_ForcedDropClusters': { 'external_name': 'IN Drop Cluster',  'key': 'agg_id', 'editable': True },
     'IN_ForcedDropPoints': { 'external_name': 'IN Drop Point' },
     'IN_ForcedDropRoutes': { 'external_name': 'IN Drop Route' },
  
     'IN_ForcedNonFiberClusters': { 'external_name': 'IN NonFiberCluster' },
     'IN_ForcedEquipment': { 'external_name': 'IN Equipment' },
     
     'processed_CentralOffice': { 'external_name': 'PROC Central Office' },
     'processed_DemandPoints': { 'external_name': 'PROC Demand Point' },
     'processed_ExistingEquipment': { 'external_name': 'PROC Existing Equipment' },
     'processed_EdgesNotConnected': { 'external_name': 'PROC Unconnected Edge' },
     'processed_NodesNotConnected': { 'external_name': 'PROC Unconnected Node' },
     'processed_BuildingsNotConnected': { 'external_name': 'PROC Unconnected Building' },
     'processed_Poles': { 'external_name': 'PROC Pole' },
     'processed_Edges': { 'external_name': 'PROC Edge' },
     'processed_Nodes': { 'external_name': 'PROC Node' },


     'OUT_BackBoneCableClusters': { 'external_name': 'OUT Backbone Cable Cluster',  'key': 'agg_id' },
     'OUT_BackBoneCables': { 'external_name': 'OUT Backbone Cable',  'key': 'cable_id' },
     'OUT_BackBoneClusters': { 'external_name': 'OUT Backbone Cluster',  'key': 'agg_id' },
     'OUT_BackBoneDuct': { 'external_name': 'OUT Backbone Duct' },
     'OUT_BackBonePoints': { 'external_name': 'OUT Backbone Point' },
     'OUT_BackBoneRoutes': { 'external_name': 'OUT Backbone Route' },
    
     'OUT_FeederCableClusters': { 'external_name': 'OUT Feeder Cable Cluster',  'key': 'agg_id' },
     'OUT_FeederCableEntries': { 'external_name': 'OUT Feeder Cable Entry',  'key': 'entry_id' },
     'OUT_FeederCablePieces': { 'external_name': 'OUT Feeder Cable Piece',  'key': 'piece_id' },
     'OUT_FeederSlack': { 'external_name': 'OUT Feeder Slack',  'key': 'slack_id' },
     'OUT_FeederCables': { 'external_name': 'OUT Feeder Cable',  'key': 'cable_id' },
     'OUT_FeederCablesDetail': { 'external_name': 'OUT Feeder Cable Detail' },
     'OUT_FeederClusters': { 'external_name': 'OUT Feeder Cluster',  'key': 'agg_id' },
     'OUT_FeederDuct': { 'external_name': 'OUT Feeder Duct' },
     'OUT_FeederDuctPieces': { 'external_name': 'OUT Feeder Duct Piece',  'key': 'piece_id' },
     'OUT_FeederPoints': { 'external_name': 'OUT Feeder Point' },
     'OUT_FeederRoutes': { 'external_name': 'OUT Feeder Route' },

     'OUT_PrimaryDistributionCable Clusters': { 'external_name': 'OUT Primary Distribution Cable Cluster',  'key': 'agg_id' },
     'OUT_PrimaryDistributionCablePieces': { 'external_name': 'OUT Primary Distribution Cable Piece',  'key': 'piece_id' },
     'OUT_PrimaryDistributionCables': { 'external_name': 'OUT Primary Distribution Cable',  'key': 'cable_id' },
     'OUT_PrimaryDistributionCablesDetail': { 'external_name': 'OUT Primary Distribution Cable Detail' },
     'OUT_PrimaryDistributionClusters': { 'external_name': 'OUT Primary Distribution Cluster',  'key': 'agg_id' },
     'OUT_PrimaryDistributionDuct': { 'external_name': 'OUT Primary Distribution Duct' },
     'OUT_PrimaryDistributionDuct Pieces': { 'external_name': 'OUT Primary Distribution Duct Piece',  'key': 'piece_id' },
     'OUT_PrimaryDistributionPoints': { 'external_name': 'OUT Primary Distribution Point' },
     'OUT_PrimaryDistributionRoutes': { 'external_name': 'OUT Primary Distribution Route' },
     
     'OUT_DistributionCableClusters': { 'external_name': 'OUT Distribution Cable Cluster',  'key': 'agg_id' },
     'OUT_DistributionCableEntries': { 'external_name': 'OUT Distribution Cable Entry',  'key': 'entry_id' },
     'OUT_DistributionCablePieces': { 'external_name': 'OUT Distribution Cable Piece',  'key': 'piece_id' },
     'OUT_DistributionSlack': { 'external_name': 'OUT Distribution Slack',  'key': 'slack_id' },
     'OUT_DistributionCables': { 'external_name': 'OUT Distribution Cable',  'key': 'cable_id' },
     'OUT_DistributionCablesDetail': { 'external_name': 'OUT Distribution Cable Detail' },
     'OUT_DistributionClusters': { 'external_name': 'OUT Distribution Cluster',  'key': 'agg_id' },
     'OUT_DistributionDuct': { 'external_name': 'OUT Distribution Duct' },
     'OUT_DistributionDuct Pieces': { 'external_name': 'OUT Distribution Duct Piece',  'key': 'piece_id' },
     'OUT_DistributionPoints': { 'external_name': 'OUT Distribution Point' },
     'OUT_DistributionRoutes': { 'external_name': 'OUT Distribution Route' },
     
     'OUT_DropCableEntries': { 'external_name': 'OUT Drop Cable Entry',  'key': 'entry_id' },
     'OUT_DropCablePieces': { 'external_name': 'OUT Drop Cable Piece',  'key': 'piece_id' },
     'OUT_DropSlack': { 'external_name': 'OUT Drop Slack',  'key': 'slack_id' },
     'OUT_DropCables': { 'external_name': 'OUT Drop Cable',  'key': 'cable_id' },
     'OUT_DropCablesDetail': { 'external_name': 'OUT Drop Cable Detail' },
     'OUT_DropClusters': { 'external_name': 'OUT Drop Cluster',  'key': 'agg_id' },
     'OUT_DropDuct': { 'external_name': 'OUT Drop Duct' },
     'OUT_DropDuctPieces': { 'external_name': 'OUT Drop Duct Piece',  'key': 'piece_id' },
     'OUT_DropPoints': { 'external_name': 'OUT Drop Point' },
     'OUT_DropRoutes': { 'external_name': 'OUT Drop Route' },
     
     'OUT_AccessStructures': { 'external_name': 'OUT Access Structure',  'key': 'eq_id', 'title': 'OUT [type]: [eq_id]', 'short_description': '[layer]' },
     'OUT_Closures': { 'external_name': 'OUT Splice Closure',  'key': 'eq_id' },
     'OUT_CoaxEquipment': { 'external_name': 'OUT Coax Equipment',  'key': 'eq_id' },
     'OUT_DemandPoints': { 'external_name': 'OUT Demand Point' },
     'OUT_Fibers': { 'external_name': 'OUT Fiber',  'key': 'fiber_id' },
     'OUT_ForcedEquipment': { 'external_name': 'OUT Forced Equipment' },
     'OUT_MicroDuctConnectors': { 'external_name': 'OUT Micro Duct Connector' },
     'OUT_ProtectionPipes': { 'external_name': 'OUT Protection Pipe' },
     'OUT_Splices': { 'external_name': 'OUT Connection',  'key': 'splice_id' },
     'OUT_Splitters': { 'external_name': 'OUT Splitter',  'key': 'split_id' },
     
     'OUT_UsedSegments': { 'external_name': 'OUT Used Segment', 'key': 'id' },
     'OUT_Nodes': { 'external_name': 'OUT Node', 'key': 'id' },
     'OUT_Edges': { 'external_name': 'OUT Edge', 'key': 'id'}
}

ws      =  ComsofWS('C:/Users/trmay/myWorld/projects/comsof/v22.1/alpha/run4.5/workspace')
#ws      =  ComsofWS('C:/Users/trmay/myWorld/releases/myWorld-6.4/WebApps/myworldapp/modules/comsof/templates/v22.2.2.43/Default Template')
ftr_pkg = ws.featurePackage()

for name,info in infos.items():
    db.progress(4,name)
    desc = ftr_pkg.featureDesc(name)
    
    if not desc:
        db.progress('warning','Skipping',name)
        continue

    user_key  = info.get('key','fid')
    geom_type = desc.primary_geom_field.type
    
    title      = info.get('title','{display_name}: ['+user_key+']')
    short_desc = info.get('short_description',None)
    
    db.progress(3,name,user_key,geom_type)
   
    
    defn = {
       'datasource': 'comsof',
       'name': name,
       'external_name': info['external_name'],
       'title': title,
       'short_description': short_desc,
       'editable': {
          'insert_from_gui': False,
          'update_from_gui': False,
          'delete_from_gui': False
       },
       'fields': [
          {
             'name': 'fid',
             'external_name': 'Id',
             'type': 'integer',
             'key': True
          },
          {
             'name': 'geometry',
             'type': geom_type
          }
       ]
    }

    if user_key != 'fid':
        fld = {
             'name': user_key,
             'type': 'integer'
            }
            
        defn['fields'].append(fld)

    file_name = 'C:/Users/trmay/myWorld/releases/myWorld-6.4/WebApps/myworldapp/modules/comsof/server/db_schema/resources/install/datasource/{}.def'.format(name)
    
    with open(file_name,'w') as strm:
        json.dump(defn,strm,indent=3)
        
