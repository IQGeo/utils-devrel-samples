###############################################################################
# Controller for providing TMF API
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import json,os
from pyramid.view import view_config, exception_view_config, notfound_view_config
import pyramid.httpexceptions as exc
from pyramid.response import Response

from myworldapp.core.server.dd.myw_reference import MywReference
from .utils import handling_exceptions
from .mywcom_controller import MywcomController
from .mywcom_feature_controller import MywcomFeatureController
from .tmf_helpers.tmf_request_wrapper import wrapRequest
from .tmf_helpers.tmf_helper import TmfHelper
from myworldapp.core.server.base.core.myw_error import MywError, MywUnknownFeatureTypeError
from sqlalchemy.exc import DataError
from myworldapp.modules.comms.server.base.readonly_feature_view import ReadonlyFeatureView
from myworldapp.core.server.models.myw_application import MywApplication

from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.controllers.base.myw_feature_collection import MywFeatureCollection
from myworldapp.modules.comms.server.api.pin_range import PinRange

class MywcomTMFController(MywcomController, MywcomFeatureController):
    """
    This controller provides a TMF flavoured API for NMT and implements the API specified in ./comms/api/nmt_api.json. 
    The main differences from the internal API used by browser client are:
         - camelCase format for names and avoiding abbreviations
         - The inclusion of schema information in the response.
         - Wider error checking and machine readable error response.
    """
    def __init__(self, request):
        """
        Initialize slots of self
        """
        super().__init__(request, "TMF")
               
        self.db_view = self.db.view("")
        self.nw_view = self.networkView(self.db_view)

        self.tmf_helper = TmfHelper(self.db, self.nw_view)
        self.tmf_json = None
    
    @view_config(
        route_name="mywcom_tmf_controller.with_id",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def resource_get(self):
        """
        Get single feature by id. Accepts 'fields' param
        """
        tmf_feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        comms_feature_type = self.tmf_helper.tmfToCommsFeatureType(tmf_feature_type)
        id = self.get_param(self.request, "id",mandatory=True)
        fields = self.get_param(self.request, "fields", list=True, default=[])
        delta = self.get_delta_param(self.request)
        application = self.get_param(self.request, "application")
        aspects = {}
        aspects["include_lobs"] = self.get_param(self.request, "includeLobs", bool, default=False)
        include_ref_sets = self.get_param(self.request, "includeCalculatedReferenceSets", bool, default=False)
       
        if not self.db.dd.featureTypeExists('myworld', comms_feature_type):
            raise exc.HTTPNotFound("No such feature type: '" + tmf_feature_type + "'")
        
        self._assertApplicationExist(application)
        
        urn = f"{comms_feature_type}/{id}"
        ref = MywReference.parseUrn(urn)
        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=ref.feature_type,
            application=application,
        )

         # Get feature
        self.db_view = self.db.view(delta)
        feature = self._checkFeatureExists(self.db_view, ref.urn(), tmf_feature_type, id)

        url = self.resourceInventoryUrlFor(tmf_feature_type, id)
        geojson_feature = feature.asGeojsonFeature(**aspects)
        if include_ref_sets:
            self._getReferenceSetFields(feature, geojson_feature)
        tmfJson = self.tmf_helper.asTMFResourceJSON(geojson_feature, url, fields)
        self.posGetTriggerApi(self.db_view, feature, tmfJson)

        return tmfJson

    @view_config(route_name="mywcom_tmf_controller.no_id", 
                 request_method="GET", 
                 renderer="json")
    def query(self):
        """
        Get multiple features by filter. Accepts 'fields' param.
        """

        tmf_feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        comms_feature_type = self.tmf_helper.tmfToCommsFeatureType(tmf_feature_type)
        fields = self.get_param(self.request, "fields", list=True, default=[])
        application = self.get_param(self.request, "application")
       
        if not self.db.dd.featureTypeExists('myworld', comms_feature_type):
            raise exc.HTTPNotFound("No such feature type: '" + tmf_feature_type + "'")
        
        self._assertApplicationExist(application)

        filter = self.tmf_helper.buildTmfFilter(comms_feature_type, self.request.params)
        if filter:
            # TBR: workaround for immutable pyramid request object - <need platform ticket here>
            # wrap request and params to allow params update
            old_params = dict(self.request.params.dicts[0])
            newRequest = wrapRequest(self.request, old_params, {"filter": filter} )
            self.request = newRequest

        self.request.matchdict["feature_type"] = comms_feature_type

        try:
            tmf_json_collection = self._query(tmf_feature_type, fields)
        except MywError as e:
            raise exc.HTTPBadRequest(e.msg) from e

        return tmf_json_collection

    def _query(self, tmf_feature_type, fields):
        """
        Copy of query implementation in mywFeatureController so we can raise the individual recs in a trigger
        """

        feature_type = self.request.matchdict["feature_type"]

        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.request.params.get("application"),
            ignore_csrf=True,
        )

        # Unpick parameters
        application = self.get_param(self.request, "application")
        aspects = self._get_aspect_params(self.request)
        delta = self.get_delta_param(self.request)
        limit = self.get_param(self.request, "limit", int)
        offset = self.get_param(self.request, "offset", int)
        include_total = self.get_param(self.request, "include_total", bool, default=False)
        aspects = {}
        aspects["include_lobs"] = self.get_param(self.request, "includeLobs", bool, default=False)
        include_ref_sets = self.get_param(self.request, "includeCalculatedReferenceSets", bool, default=False)

        # Build full query
        table = self.db.view(delta).table(feature_type)
        req = self.parseRequest(application, self.request, table)
        svars = self.getSessionVars(application, self.request)

        # Get limit parameter
        # Note: We ask for 'limit+1' so that we can tell if there are more to get
        query_limit = None
        if limit:
            query_limit = limit + 1

        # Get (next chunk of) result
        recs = table.filter(req.predicate(), svars).offset(offset).limit(query_limit)

        for field_name, ascending in req.order_by_info():
            recs = recs.orderBy(field_name, ascending=ascending)

        recs = recs.all()

        # Check for incomplete result
        n_recs = len(recs)
        more_to_get = False
        if n_recs == query_limit:
            recs.pop()
            n_recs -= 1
            more_to_get = True

        # Get full count (if requested)
        total_n_recs = None
        if (not more_to_get) and (
            (n_recs > 0) or (not offset)
        ):  # In last chunk ... so can compute total size
            total_n_recs = n_recs + (offset or 0)
        elif include_total:
            total_n_recs = table.filter(req.predicate(), svars).count()       

        # raise get trigger for each rec in response. trigger code can augment
        tmfArray = []
        for rec in recs:
            feature_json = rec.asGeojsonFeature(**aspects)
            if include_ref_sets:
                self._getReferenceSetFields(rec, feature_json)
            url = self.resourceInventoryUrlFor(tmf_feature_type, feature_json.id)
            tmf_json = self.tmf_helper.asTMFResourceJSON(feature_json, url, fields)
            tmfArray.append(tmf_json)
            self.posGetTriggerApi(self.db_view,rec,tmf_json)

        return MywFeatureCollection(tmfArray, limit, offset, total_n_recs)
    
    @view_config(
        route_name="mywcom_tmf_controller.network_trace",
        request_method="GET",
        renderer="json",
    )
    def network_trace(self):
        """
        Perform network trace from a node (eg port or range of ports) and return tree of nodes and features.
        """
        
        network = self.get_param(self.request, "network", mandatory=True)

        # Unpick parameters
        start_feature_urn = self.get_param(self.request, "from", mandatory=True)
        direction = self.get_param(
            self.request,
            "direction",
            values=["upstream", "downstream", "both"],
            default="downstream",
        )
        extra_filters = self.get_param(self.request, "filters", type="json", default={})
        max_dist = self.get_param(self.request, "maxDistance", type=float, validator=lambda x: x > 0)
        max_nodes = self.get_param(self.request, "maxNodes", type=int, validator=lambda x: x > 0)
        feature_types = self.get_param(self.request, "return", list=True)
        application = self.get_param(self.request, "application")
        delta = self.get_delta_param(self.request)
     
        self.current_user.assertAuthorized(self.request)
               
        self.db_view = self.db.view(delta)

        # Get engine for network. Convert HTTPNotFound to HTTPBadRequest and
        # provide more informative error message.
        try:
            engine = self.network_engine_for(network, delta, extra_filters)
        except exc.HTTPNotFound:
            raise exc.HTTPBadRequest("Invalid network specified.")

        # Validate start URN is correct before trace engine attempts to use it
        self.validateFeaturePinUrn("from", start_feature_urn)
      
        root_node = None
        try:
            root_node = engine.rootNode(start_feature_urn,direction)
        except:
            pass

        if not root_node:
            raise exc.HTTPBadRequest("Invalid start feature URN specified")
      
        # Wrap to catch trace limit exceeded.
        # ENH: Return partial trace in this case.
        try:
            tree = engine.traceOut(start_feature_urn, direction, max_dist, max_nodes)
        except MywError as ex:
            if ex.msg == "Trace size limit exceeded":
                raise exc.HTTPBadRequest(ex.msg)
            else:
                raise exc.HTTPError(ex.msg)
       
        return self.networkTraceResultsFrom(tree, feature_types, application)
    

    def validateFeaturePinUrn(self, param, feature_urn):
        """
        Validate that FEATURE_URN references an extant feature and pins specification is valid
        """

        ref = MywReference.parseUrn(feature_urn)

        # We check each part of URN as platform will raise exception if table wrong.
        table = self.db_view.table(ref.feature_type, error_if_none=False)
        if not table:
            raise exc.HTTPBadRequest(f"Invalid '{param}' parameter. Feature table not found.")

        start_feature = table.get(ref.id)
        if not start_feature:
            raise exc.HTTPBadRequest(f"Invalid '{param}' parameter. Feature not found.")
        
        if not self.checkPinsExist(feature_urn):
            raise exc.HTTPBadRequest(f"Invalid '{param}' parameter. Pin range invalid.")


    def checkPinsExist(self,feature_urn):
        """
        Check that pin range on URN is valid for the feature specified.
        """

        ref = MywReference.parseUrn(feature_urn)
        feature = self.db_view.get(ref.urn())
        if 'pins' not in ref.qualifiers:
            return False
        pins = PinRange.parse(ref.qualifiers['pins'])        
        if pins.size <= 0:
            return False
        
        tech = self.nw_view.networkFor(feature,pins.side)        
        pins_full = self.nw_view.networks[tech].pinsOn(feature, pins.side)
        
        if pins and pins_full and not pins in pins_full:
            return False
        return True

    
    def resourceInventoryUrlForJson(self, feature_json):
        """
        Calculate URL for resource inventory service for a feature provided as JSON
        """

        comms_feature_type = feature_json.myw['feature_type']
        tmf_feature_type = self.tmf_helper.commsToTmfFeatureType(comms_feature_type)
        return self.resourceInventoryUrlFor(tmf_feature_type, feature_json.id)

    def resourceInventoryUrlFor(self, tmf_feature_type, feature_id):
        """
        Return URL for resource inventory service for a feature
        """

        url = self.request.route_url("mywcom_tmf_controller.with_id", feature_type=tmf_feature_type, id=feature_id)
        return url

    def networkTraceResultsFrom(self, tree, feature_types, application):
        """
        Convert results of network trace into networkTrace object
        """
        lang = self.get_param(self.request, "lang", type=str, default=None)

        feature_aspects = {
            "include_display_values": True,  # TODO: Pass these in
            "include_lobs": False,
            "include_geo_geometry": True,
            "lang": lang,
        }

        # Prevent return of inaccessible feature types
        accessible_feature_types = self.current_user.featureTypes(
            "myworld", application_name=application
        )

        if feature_types:
            feature_types = set(feature_types).intersection(accessible_feature_types)
        else:
            feature_types = set(accessible_feature_types)


        trace_result = tree.asTraceResult(feature_aspects, feature_types)
        features = trace_result['features']
        tmf_features = {}

        for urn in features.keys():
            feature = self.db_view.get(urn)
            feature_json = feature.asGeojsonFeature()
            url = self.resourceInventoryUrlForJson(feature_json)
            tmf_features[urn] = self.tmf_helper.asTMFResourceJSON(feature_json, url)

        # Return nodes as a simple array rather than an dict 
        # indexed by an int wrapped as a string.
        tmf_nodes = [None] * (len(trace_result['nodes']))
        for idx, node in trace_result['nodes'].items():
            tmf_nodes[int(idx)-1] = self.tmf_helper.asTmfNode(node)                                        

        # Provide end nodes as a convenience for caller so they don't have to process the trace
        # tree to find end of trace.    
        trace_ends = self.findTraceEndNodes(trace_result['nodes'])

        return { 
                'ends' : trace_ends,
                'nodes' : tmf_nodes, 
                'resources' : tmf_features,
                '@type' : "NetworkTrace",
                '@schemaLocation' : "NetworkTrace.schema.json"
        }

    def findTraceEndNodes(self, nodes):
        """
        Find end nodes of trace.
        """
        
        leaf_nodes = set( nodes.keys() )

        for idx,a_node in nodes.items():
            leaf_nodes.discard(a_node['parent'])
      
        return list(map(lambda x: int(x)-1, leaf_nodes))
    
    def network_engine_for(self, name, delta, extra_filters={}):
        """
        Returns MywNetworkEngine engine for network NAME (error if not found)
        """

        # ENH: Stash definition or engine in config cache

        settings = self.request.registry.settings
        trace_level = settings.get("myw.network.options", {}).get("log_level", 0)

        # Find network record
        network_def = self.current_user.networkDefs().get(name)
        if not network_def:
            raise exc.HTTPBadRequest('Invalid network specified.')

        # Build progress reporter
        progress = MywSimpleProgressHandler(trace_level, "INFO: NETWORK TRACING: ")
        progress(1, "Constructing engine for network:", name, extra_filters)

        # Construct engine
        db_view = ReadonlyFeatureView(self.db.view(delta))
        return MywNetworkEngine.newFor(
            db_view, network_def, extra_filters=extra_filters, progress=progress
        )
    
    # ==============================================================================
    #                            CREATE / UPDATE & DELETE
    # ==============================================================================

    @view_config(
        route_name="mywcom_tmf_controller.no_id",
        request_method="POST",
        renderer="json"
    )
    def create(self):

        tmf_feature_type = self.request.matchdict["feature_type"]
        application = self.get_param(self.request, "application")
        self.get_delta_param(self.request) # not using delta here, just raise error if bad 
       
        comms_feature_type = self.tmf_helper.tmfToCommsFeatureType(tmf_feature_type)
        if not self.db.dd.featureTypeExists('myworld', comms_feature_type):
            raise exc.HTTPNotFound("No such feature type: '" + tmf_feature_type + "'")
        
        self._assertApplicationExist(application)

        body = self.request.environ["wsgi.input"].read(int(self.request.environ["CONTENT_LENGTH"]))
        try:
            tmf_json = json.loads(body)
        except json.JSONDecodeError as e:
            raise exc.HTTPBadRequest("Invalid json: " + e.msg) from e
        
        # validate schema
        if "@type" in tmf_json:
            schema_name = tmf_json["@type"]
        else:
            (schema_name, base) = self.tmf_helper.getSchema(comms_feature_type)

        self._assertSchemaAllowedEdit(schema_name)

        valid = self.tmf_helper.validateSchema(tmf_json, schema_name)
        if valid:
            raise exc.HTTPBadRequest("Input request body does not match schema: " + valid)

        # update request body and feature type
        new_feature = self.tmf_helper.TmfAsCommsJson(comms_feature_type, schema_name, tmf_json)
        self.request.text = json.dumps(new_feature)
        self.request.matchdict["feature_type"] = comms_feature_type
        self.tmf_json = tmf_json

        # call myw_feature_controller
        resp = super().create()
        url = self.resourceInventoryUrlFor(comms_feature_type, resp.id)
        tmfJson = self.tmf_helper.asTMFResourceJSON(resp, url)
        return tmfJson


    @view_config(
        route_name="mywcom_tmf_controller.with_id",
        request_method="PATCH",
        renderer="json"
    )
    def update_patch(self):

        tmf_feature_type = self.request.matchdict["feature_type"]
        delta = self.get_delta_param(self.request)
        application = self.get_param(self.request, "application")
        id = self.request.matchdict["id"]

        comms_feature_type = self.tmf_helper.tmfToCommsFeatureType(tmf_feature_type)
        if not self.db.dd.featureTypeExists('myworld', comms_feature_type):
            raise exc.HTTPNotFound("No such feature type: '" + tmf_feature_type + "'")
        
        self._assertApplicationExist(application)
        
        body = self.request.environ["wsgi.input"].read(int(self.request.environ["CONTENT_LENGTH"]))
        try:
            tmf_json = json.loads(body)
        except json.JSONDecodeError as e:
            raise exc.HTTPBadRequest("Invalid json: " + e.msg) from e
        
        # validate schema
        if "@type" in tmf_json:
            schema_name = tmf_json["@type"]
        else:    
            (schema_name, base) = self.tmf_helper.getSchema(comms_feature_type)

        self._assertSchemaAllowedEdit(schema_name)

        valid = self.tmf_helper.validateSchema(tmf_json, schema_name)
        if valid:
            raise exc.HTTPBadRequest("Input request body does not match schema: " + valid)

        # Check whether feature exists
        urn = f"{comms_feature_type}/{id}"
        self.db_view = self.db.view(delta)
        self._checkFeatureExists(self.db_view, urn, tmf_feature_type, id)
        
         # update request body and feature type
        new_feature = self.tmf_helper.TmfAsCommsJson(comms_feature_type, schema_name, tmf_json)
        self.request.text = json.dumps(new_feature)
        self.request.matchdict["feature_type"] = comms_feature_type
        self.tmf_json = tmf_json
        
        # call myw_feature_controller
        resp = super().update()
        url = self.resourceInventoryUrlFor(comms_feature_type, id)
        tmfJson = self.tmf_helper.asTMFResourceJSON(resp, url)
        return tmfJson
    

    # ENH: The dev tools test framework use of paste.fixture.testapp does not support PATCH.
    @view_config(
        route_name="mywcom_tmf_controller.with_id",
        request_method="PUT",
        renderer="json"
    )
    def update_put(self):
        return self.update_patch()


    @view_config(
        route_name="mywcom_tmf_controller.with_id",
        request_method="DELETE",
    )
    def delete(self):
        """"
        Delete feature by id
        """

        tmf_feature_type = self.request.matchdict["feature_type"]
        delta = self.get_delta_param(self.request)
        application = self.get_param(self.request, "application")
        id = self.request.matchdict["id"]
        
        comms_feature_type = self.tmf_helper.tmfToCommsFeatureType(tmf_feature_type)
        if not self.db.dd.featureTypeExists('myworld', comms_feature_type):
            raise exc.HTTPNotFound("No such feature type: '" + tmf_feature_type + "'")
        
        self._assertApplicationExist(application)

        (schema_name, base) = self.tmf_helper.getSchema(comms_feature_type)
        self._assertSchemaAllowedEdit(schema_name)
        
         # Check whether feature exists
        urn = f"{comms_feature_type}/{id}"
        self.db_view = self.db.view(delta)
        self._checkFeatureExists(self.db_view, urn, tmf_feature_type, id)

        self.request.matchdict["feature_type"] = comms_feature_type
        # call myw_feature_controller
        resp = super().delete()

        return resp

    @view_config(
        route_name="mywcom_tmf_controller.metadata",
        request_method="GET",
    )
    def metadata(self):
        """
        Return TMF API metadata
        """

        spec_file = self.get_param(self.request, "specification_file", mandatory=True)

        return self._getMetadataOrSchema(spec_file)
    
    @view_config(
        route_name="mywcom_tmf_controller.schema",
        request_method="GET",
    )
    def schema(self):
        """
        Return TMF API schema
        """

        schema_file = self.get_param(self.request, "schema_file", mandatory=True)

        return self._getMetadataOrSchema(os.path.join("schema",schema_file))


    def _getMetadataOrSchema(self, file):
        """
        Return metadata or schema file
        """

        # Check authorised
        self.current_user.assertAuthorized(self.request)

        content = self.tmf_helper.getMetadata(file)

        # Return data with file name
        self.request.response.content_type = "text/plain"
        self.request.response.content_disposition = f'attachment; filename="{file}"'
        self.request.response.text = content
        return self.request.response 

    def _checkFeatureExists(self, db_view, urn, tmf_feature_type, id):
        """
        Check for feature, raise error if it doesn't exist
        """
        try:
            feature = db_view.get(urn)
            if feature == None:
                raise exc.HTTPNotFound(f"No such feature: type='{tmf_feature_type}' and id={id}")
            return feature
        except DataError as e:
            # catch the DataError here before it is turned into a HTTPBadGateway by core controller utils
            lines = e.orig.pgerror.split("\n")
            raise exc.HTTPNotFound(lines[0]) from e

    def _assertSchemaAllowedEdit(self, schema_name):

        schema_whitelist = self.db.setting("mywcom.tmf_edit_allowed")
        allowed_edit = False
        if schema_whitelist != None and schema_name in schema_whitelist:
            allowed_edit = True
            
        if not allowed_edit: 
            raise exc.HTTPForbidden(f"Editing of feature category '{schema_name}' is not allowed.")
    
    def _getReferenceSetFields(self, feature, geojson_feature):
        """
        feature.asGeojsonFeature does not process calculated reference set arrays
        add them to the json properties here
        """
        ft_rec = self.db.dd.featureTypeRec("myworld", feature.feature_type)
        ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)
        for fld_name, fld_desc in ft_desc.fields.items():
            if fld_desc.type == 'reference_set': 
                ref_set_array = []
                fld = feature._field(fld_name)
                # getting recs from the field uses select_regex in core and will error unless we check here
                has_select = getattr(fld,'select_regex', None) and fld.select_regex.match(fld.desc.value)
                if has_select: 
                    ref_set_array = [rec._urn() for rec in fld.recs()]

                fld_exists = geojson_feature['properties'].get(fld_name, None)
                if ref_set_array and not fld_exists:
                    geojson_feature['properties'].update({fld_name: ref_set_array})

    # ------------------------------------------------------------------------------
    #                   MywFeatureController Overrides
    # ------------------------------------------------------------------------------

    def _insertFeature(self, table, feature, update=True):
        """
        Insert the feature (running TMF triggers)
        """

        self.preInsertTriggerApi(table, feature)
        rec = super()._insertFeature(table, feature, update)
        self.posInsertTriggerApi(table.view, rec)

        return rec
    
    def _updateFeature(self, table, feature, id=None):
        """
        Update the feature (running TMF triggers)
        """
        if not id:
            id = feature.properties[table.descriptor.key_field_name]

        # Get a handle on the record before update
        rec = table.get(id)

        orig_rec = None
        if rec:
            orig_rec = rec._clone()

        rec = super()._updateFeature(table, feature, id)
        self.posUpdateTriggerApi(table.view, rec, orig_rec)

        return rec
    
    def _deleteFeature(self, table, feature=None, id=None, abort_if_none=False):
        """
        Deletes the feature (running TMF triggers)
        """

        if not id:
            id = feature.properties[table.descriptor.key_field_name]

        rec = table.get(id)

        self.preDeleteTriggerApi(table.view, rec)
        rec = super()._deleteFeature(table, feature, id, abort_if_none)

        return rec

    # ------------------------------------------------------------------------------
    #                                  TRIGGERS
    # ------------------------------------------------------------------------------

    def posGetTriggerApi(self, view, rec, featureJSON):
        """
        Perform post-get actions
        """
        self.networkView(view).runTriggers(rec, "pos_get_api", featureJSON)

    def preInsertTriggerApi(self, table, feature):
        """
        Perform pre-insert actions
        """
        feature.feature_type = table.feature_type  
        self.networkView(table.view).runTriggers(feature, "pre_insert_api", self.tmf_json)

    def posInsertTriggerApi(self, view, rec):
        """
        Perform post-insert actions
        """
        self.networkView(view).runTriggers(rec, "pos_insert_api", self.tmf_json)

    def posUpdateTriggerApi(self, view, rec, orig_rec):
        """
        Perform post-update actions
        """
        self.networkView(view).runTriggers(rec, "pos_update_api", orig_rec, self.tmf_json)

    def preDeleteTriggerApi(self, view, rec):
        """
        Perform pre-delete actions
        """
        if not rec:
            return

        self.networkView(view).runTriggers(rec, "pre_delete_api")

    def get_param(
        self, request, name, type=str, list=False, default=None, mandatory=False, values=None, validator=None
    ):
        """
        Helper to get request parameter NAME, cast to TYPE

        TYPE is a class such as str or int.
        VALUES defines permitted values.

        Subclassed to provide better error message and to call a validator if provided
        """

        try:
            val = super().get_param(
                request, name, type=type, list=list, default=default, mandatory=mandatory, values=values
            )
        except exc.HTTPBadRequest:          
            raise exc.HTTPBadRequest(f"Malformed request: Missing or malformed parameter '{name}'")

        if validator and val:
            if not validator(val):
                raise exc.HTTPBadRequest(f"Malformed request: Missing or malformed parameter '{name}'")
            
        return val
    
    def get_delta_param(self, request):
        """
        Get delta parameter from request and validate it
        """

        delta = self.get_param(request, "delta")
        if not delta:
            return delta
        
        ref = MywReference.parseUrn(delta, error_if_bad=False)
        if not ref:
            raise exc.HTTPBadRequest(f"Invalid delta parameter specified: '{delta}' cannot be parsed")

        designs = self.db.setting("mywcom.designs")
        if not ref.feature_type in designs:
             raise exc.HTTPBadRequest(f"Invalid delta parameter specified: '{ref.feature_type}' design type does not exist")

        if self.db.view('').get(delta, error_if_bad=False):
            return delta
        else:
            raise exc.HTTPBadRequest(f"Invalid delta parameter specified: '{ref.id}' name does not exist in type '{ref.feature_type}'")
    
    def _assertApplicationExist(self, application_name):
        """
        Validate Application record identified by APPLICATION_NAME 
        """
        if application_name == None:
            return True

        rec = (
            self.db.session.query(MywApplication)
            .filter(MywApplication.name == application_name)
            .first()
        )

        if not rec: 
             raise exc.HTTPBadRequest(f"Invalid application specified: '{application_name}'")
        
        return rec != None
    
    @staticmethod
    def _remapException(excep):
        """
        Remap exceptions to correct HTTP error exception
        """

        # We do this as our wrappers convert all exceptions to bad gateway.
        # ENH: Fix wrappers to work with internal and external API

        if excep.message and excep.message.find("bad_circuit_path") > -1:
            return exc.HTTPBadRequest("Unable to find path between specified end points")
        
        return excep
       

@notfound_view_config()
def notfound(request):
    """
    Return this when route does not match
    """
    msg = f"The request URL '{request.path}' does not exist on host."
    return json_error_response(404, 'The request URL is invalid.',  msg)

# ENH: See if Pyramid offers a nicer way of doing this.
@exception_view_config(exc.HTTPUnauthorized, route_name="mywcom_tmf_controller.with_id")
@exception_view_config(exc.HTTPUnauthorized, route_name="mywcom_tmf_controller.no_id")
@exception_view_config(exc.HTTPUnauthorized, route_name="mywcom_tmf_controller.network_trace")
@exception_view_config(exc.HTTPForbidden, route_name="mywcom_tmf_controller.with_id")
@exception_view_config(exc.HTTPForbidden, route_name="mywcom_tmf_controller.no_id")
@exception_view_config(exc.HTTPNotFound, route_name="mywcom_tmf_controller.with_id")
@exception_view_config(exc.HTTPNotFound, route_name="mywcom_tmf_controller.no_id")
@exception_view_config(exc.HTTPNotFound, route_name="mywcom_tmf_controller.network_trace")
@exception_view_config(exc.HTTPBadRequest, route_name="mywcom_tmf_controller.with_id")
@exception_view_config(exc.HTTPBadRequest, route_name="mywcom_tmf_controller.no_id")
@exception_view_config(exc.HTTPBadRequest, route_name="mywcom_tmf_controller.network_trace")
@exception_view_config(exc.HTTPBadGateway, route_name="mywcom_tmf_controller.with_id")
@exception_view_config(exc.HTTPBadGateway, route_name="mywcom_tmf_controller.no_id")
@exception_view_config(exc.HTTPBadGateway, route_name="mywcom_tmf_controller.network_trace")
@exception_view_config(exc.HTTPError, route_name="mywcom_tmf_controller.with_id")
@exception_view_config(exc.HTTPError, route_name="mywcom_tmf_controller.no_id")
@exception_view_config(exc.HTTPError, route_name="mywcom_tmf_controller.network_trace")
def handle_error(exc, request):
    """
    Provide machine readable error response.
    """
    # Request argument is not used but needs to be present for Pyramid to call this 
    # function with exception as first arg.    

    exc = MywcomTMFController._remapException(exc)

    return json_error_response(exc.code, exc.explanation, exc.message)

def json_error_response(code, explanation, message):
    template_values = {"code": code, "reason": explanation, "message" : message }
    output = json.dumps(template_values)
    response = Response(output)
    response.status_code = code
    return response