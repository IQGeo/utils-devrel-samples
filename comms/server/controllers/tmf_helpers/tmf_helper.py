###############################################################################
# Helper class with methods to convert tmf input and results to comms input and results
###############################################################################
# Copyright: IQGeo Limited 2010-2024
import json, os, re
from dataclasses import fields
from geojson import Feature
from myworldapp.core.server.base.core.myw_error import MywInternalError
import pyramid.httpexceptions as exc
from .tmf_dataclass import TmfData
from .comms_schema_validator import CommsSchemaValidator

class TmfHelper():

    api_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "api")
    schema_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "api", "schema")

    def __init__(self, db, nw_view):
        self.db = db
        self.nw_view = nw_view

    def asTMFResourceJSON(self, feature_json, url, selected_fields = []):
        """
        Convert feature into TMF resource JSON adding appropriate schema references.
        """

        # Schemas: https://github.com/tmforum-rand/schemas/blob/candidates/Resource/Resource.schema.json
        # Guide: TMF Resource Inventory Managment API User Guide        
        feature_type = feature_json.myw['feature_type']
        (schema, base) = self.getSchema(feature_type)
        top_level = self._getResource(schema)
        
        # these fields always show
        tmf_json = {
            "id" : f"{feature_type}/{feature_json.id}",
            "href" : url,  
        }

        if "none" in selected_fields:
            return tmf_json

        # create class with properties matching schema
        props_to_show = top_level['properties']
        if selected_fields:
            # only show schema specified in fields
            props_to_show = {key: props_to_show[key] for key in selected_fields if key in props_to_show}
        TmfDataClass = TmfData.createDC(schema, props_to_show)

        # maps of property names from TMF schema to feature 
        fields_map = self.db.setting("mywcom.tmf_fields")

        # grab geometry for processing
        # FIXME - Make geometry TMF flavoured
        feature_values = feature_json.properties
        feature_values['geometry'] = feature_json['geometry']
        if "secondary_geometries" in feature_json: 
            feature_values['secondary_geometries'] = feature_json['secondary_geometries']

        map = fields_map.get(schema,{})
        tmfDataClass_kwargs = TmfData.createKwargs(map, feature_json.properties)
        if selected_fields:
            tmfDataClass_kwargs =  {key: tmfDataClass_kwargs[key] for key in selected_fields if key in tmfDataClass_kwargs}
        # create instance using feature_json
        dc = TmfDataClass(**tmfDataClass_kwargs)

        # FIXME - Make geometry TMF flavoured
        # Add properties that are top level for this schema
        for fld in fields(dc):
            value = getattr(dc, fld.name)
            tmf_json[fld.name] = value

        # Bundle non-schema properties into characteristic dictionary     
        inv_map = {v: k for k, v in map.items()}
        cprops = []
        for name, value in feature_json.properties.items():
            if name not in inv_map and name != 'id' :
                if not selected_fields or self._camelCase(name) in selected_fields: # show selected fields only
                    cprops.append({ 'name' : self._camelCase(name), 'value' : value}) 
        if cprops:
            tmf_json['characteristic'] = cprops

        # Convention seems to be that these go at end
        tmf_json["@type"] = schema
        tmf_json["@baseType"] = base                

        return tmf_json
    
    def TmfAsCommsJson(self, comms_feature_type, schema_name, tmf_json):
        """
        Convert TMF request body into comms structure
        """
        new_feature = Feature()
        del new_feature.geometry
        new_feature.myw = {}
        new_feature.myw['feature_type'] = comms_feature_type

        # maps of property names from TMF schema to feature 
        tmf_fields = self.db.setting("mywcom.tmf_fields")
        fields_map = tmf_fields.get(schema_name,{})

        # category schema fields
        for tmf_name, comms_name in fields_map.items():
            if tmf_name in tmf_json:
                if tmf_name == "path" or tmf_name == "location":
                    new_feature.geometry = tmf_json[tmf_name] 
                else:
                    new_feature.properties[comms_name] = tmf_json[tmf_name]

        # tmf 'characteristic' 
        if 'characteristic' in tmf_json:
            for item in tmf_json['characteristic']:
                comms_name = self._snakeCase(item['name'])
                if comms_name == "secondary_geometries":
                    new_feature.secondary_geometries = item['value'] 
                else: 
                    new_feature.properties[comms_name] = item['value']
        
        return new_feature
    
    def tmfToCommsFeatureType(self, feature_param ):
        table_name_map = self.db.setting("mywcom.tmf_tables")
        if feature_param in table_name_map:
            table_name = table_name_map[feature_param]
        else:
            table_name = self._snakeCase(feature_param)
        
        return table_name
    
    def commsToTmfFeatureType(self, table_name):
        table_name_map = self.db.setting("mywcom.tmf_tables")
        inv_map = {v: k for k, v in table_name_map.items()}
        if table_name in inv_map:
            feature_param = inv_map[table_name]
        else:
            feature_param = self._camelCase(table_name)
        
        return feature_param

    def buildTmfFilter(self, feature_type, params):

        (schema, base) = self.getSchema(feature_type)
        fields_map = self.db.setting("mywcom.tmf_fields")
        map = fields_map.get(schema,{})

        #params that are not attribute names
        excluded = ['fields', 'application','delta']

        commsFlds = []
        for key,value in params.items():
            if key not in excluded and key in map:
                commsFldName = map[key]
                commsFlds.append(f'[{commsFldName}]={value}')

        return "&".join(commsFlds)    
    
    def asTmfNode(self,node):
        """
        Convert to TMF node format
        """

        tmf_node = {           
            'resource' : node['feature'],
            'distance' : node['dist'],
            'length' : float(node.get('length',0.0)),
        }

        if node['parent'] != 0:
            tmf_node['parent'] = int(node['parent']) - 1

        for k1, k2 in [ ('start_coord', 'startCoordinate'), ('stop_coord', 'stopCoordinate'), ('ports', 'ports'), ('fibers', 'fibers') ]:
            if k1 in node:
                tmf_node[k2] = node[k1]  

        return tmf_node
    
    def getSchema(self,feature_type):
        """
        Get schema name for FEATURE_TYPE
        """

        category = self.nw_view.categoryOf(feature_type)
        if not category:
            category = feature_type
        category = category.capitalize() 
        category_map = self.db.setting("mywcom.tmf_categories")
        schema =""
        base = ""
        if category in category_map:
            schema = category_map[category]
            base = "Feature"
        else:
            schema = category

        return (schema, base)
    
    def _getResource(self, schema):
        json_file = os.path.join(self.schema_dir, schema + ".schema.json")
        if not os.path.exists(json_file):
            raise MywInternalError("No TMF schema for feature type", schema)
        
        new_schema = json.load(open(json_file))
        resource = new_schema['definitions'][schema]

        return resource

    def _camelCase(self, name):
        """
        Convert snake_case to camelCase
        """
        temp = re.split('_+', name)
        return temp[0].lower() + ''.join(map(lambda x: x.title(), temp[1:]))

    def _snakeCase(self, name):
        """
        Convert camelCase to snake_case
        """

        return ''.join(['_'+c.lower() if c.isupper() else c for c in name]).lstrip('_')
    
    def validateSchema(self,resp,schema=None):
        """
        Validate response against schema with name SCHEMA. If not provided will extract from @type field in response
        """

        validator = CommsSchemaValidator()

        if not schema:
            schema = resp["@type"]

        invalid = validator.validate(schema,resp)
        return invalid
    
    def getMetadata(self,metadata):
        """
        Return metadata about the API
        """

        json_file = os.path.join(self.api_dir, metadata)

        if not os.path.exists(json_file):
            raise MywInternalError(f"No metadata for '{metadata}'")
        
        with open(json_file) as f:
            data = f.read()

        return data      