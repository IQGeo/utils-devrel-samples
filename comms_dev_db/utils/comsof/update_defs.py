import os,json
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.modules.comsof.server.sync.comsof_ws import ComsofWS

class defEditor():

    def __init__(self,ws_file):
        ##
        ## Init slots of self
        ##

        self.ws_file = ws_file

        module   = MywProduct().module('comsof')
        self.defs_dir  = module.file('server','db_schema','resources','install','datasource','features')
        self.os_engine = MywOsEngine()

        self.progress = db.progress

        
    def run(self,file_spec):
        ##
        ## Make edits
        ##
        
        # Get reference workspace
        ws      = ComsofWS(self.ws_file)
        ftr_pkg = ws.featurePackage()

        for file_name in self.os_engine.find_files(self.defs_dir,file_spec):
            self.progress(4,os.path.basename(file_name))
            
            # Get DD definition
            with open(file_name,"r") as strm:
                defn = json.load(strm)
            ft   = defn['name']

            # Get Geopackage descriptor
            ws_desc = ftr_pkg.featureDesc(ft)

            # Make changes
            self.addBoolField(ft,defn,ws_desc,'existing')
            self.addBoolField(ft,defn,ws_desc,'include')
            self.addBoolField(ft,defn,ws_desc,'locked')
            self.removeFromTitle(ft,defn,"Backbone")
            self.removeFromTitle(ft,defn,"Feeder")
            self.removeFromTitle(ft,defn,"Distribution")
            self.removeFromTitle(ft,defn,"PrimDistribution")
            self.removeFromTitle(ft,defn,"Drop")

            # Save definiton
            with open(file_name,'w') as strm:
                json.dump(defn,strm,indent=3)

                
    def fieldDefn(self,defn,fld):
        ##
        ## Entry in DEFN for FLD (if any)
        ##

        for fld_defn in defn['fields']:
            if fld_defn['name'] == fld:
                return fld_defn


    def addBoolField(self,ft,defn,ws_desc,fld):
        ##
        ## Sets field editors for boolean field FLD (if present)
        ##

        # Check for not on type
        ws_fld_desc = ws_desc.fields.get(fld)
        if not ws_fld_desc: return

        # Check for already present
        fld_defn = self.fieldDefn(defn,fld)
        if fld_defn: return

        self.progress(1,ft,':','Adding definition for field:',fld,'(',ws_fld_desc.type,')')
        fld_defn = {
            "name": fld,
            "type": ws_fld_desc.type,
            "mandatory": True,
            "viewer_class": "myw.ComsofBooleanFieldViewer",
            "editor_class": "myw.ComsofBooleanFieldEditor"
        }
        
        defn['fields'].insert(-1,fld_defn)
 

    def removeFromTitle(self,ft,defn,txt):
        ##
        ## Move TXT from external_name to the short description of DEFN
        ##
           
        pad_txt = txt + ' '
        if not pad_txt in defn['external_name']:
            return

        if defn['short_description']:
            self.progress('warning',ft,':','Short description already set')
            return
        
        self.progress(1,ft,':','Moving',txt,'to short description')
        ft_ident = defn['external_name'].replace(pad_txt,'')
        defn['title'] = defn['title'].replace('{display_name}',ft_ident)
        defn['short_description'] = txt

        
 
# ==============================================================================
# 
# ==============================================================================
 
file_spec = args[0] if len(args) else '*.def'

engine = defEditor('C:/Users/trmay/myWorld/projects/comsof/v22.1/alpha/run4.5/workspace')

engine.run(file_spec)
