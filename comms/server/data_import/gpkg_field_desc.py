
class GpkgFieldDesc():
    ##
    ## Descriptor for a geopackage field
    ##

    gpkg_geom_field_types = ['POINT',      'MULTIPOINT',
                             'LINESTRING', 'MULTILINESTRING',
                             'POLYGON',    'MULTIPOLYGON']
    
    def __init__(self,name,type,size=None,key=False):
        ##
        ## Init slots of self
        ##
        self.name = name
        self.type = type
        self.size = size
        self.key  = key
        
        self.is_geom = type in self.gpkg_geom_field_types

        
    def __ident__(self):
        ##
        ## String for progress messages etc
        ##

        return "{}({})".format(self.__class__.__name__,self.sqlRepr())

        
    def sqlRepr(self):
        ##
        ## Representation for SQL
        ##

        repr = "{} {}".format(self.name,self.type)

        if self.size:
            repr += str(self.size)

        return repr
 
