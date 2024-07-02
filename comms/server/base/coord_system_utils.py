import math
from pyproj.crs import CRS
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem


class CoordSystemUtils():

    coord_sys_cache = {}

    @classmethod
    def coordSystem(self,srid):
        ##
        ## Get coord system for SRID
        ##
        # Hack because MywCoordSystem() is very slow

        cs = self.coord_sys_cache.get(srid)
        if not cs:
            cs = self.coord_sys_cache[srid] = MywCoordSystem(srid)

        return cs
        
    
    def projectedCSForGeom(wgs84_geom,unit):
        ##
        ## Returns a 'good' projected coordinate system for WGS84_GEOM
        ##

        bounds = wgs84_geom.bounds
        coord  = [ (bounds[0]+bounds[2])/2.0, (bounds[1]+bounds[3])/2.0 ]  # ENH: Upgrade shapely and use .center()
        return CoordSystemUtils.projectedCSFor(coord,unit)
        

    def projectedCSFor(wgs84_coord,unit):
        ##
        ## Returns a 'good' projected coordinate system for WGS84_COORD
        ##
        ## Good means conformal with minimal scale distortion at WGS84_COORD.
        ##
        ## Unit is 'm', 'ft' or 'us-ft'

        # Returns a UTM band. See https://stackoverflow.com/a/40140326/4556479
        # ENH: Correct for scale distortion etc
        # ENH: Move to MywCoordSystem

        (lon,lat) = wgs84_coord

        # Pick UTM zone
        utm_zone = (math.floor((lon + 180) / 6 ) % 60) + 1

        # Build proj4 definition
        # Note: MywCoordSystem() currently very sensitive. Passing dict doesn't seem to be reliable
        # ENH: Change MywCoordSystem to store a pjproj CRS or similar
        if lat >= 0:
            cs_def = "+proj=utm +zone={} +datum=WGS84 +units={} +no_defs".format(utm_zone,unit)
        else:
            cs_def = "+proj=utm +zone={} +south +datum=WGS84 +units={} +no_defs".format(utm_zone,unit)
            
        return MywCoordSystem(cs_def)
 
    
    def wktDefOf(coord_sys):
        ##
        ## The OGC well known text SRS definition for COORD_SYS
        ## 

        crs = CRS.from_authority('EPSG',coord_sys.srid)
        return crs.to_wkt()
    
