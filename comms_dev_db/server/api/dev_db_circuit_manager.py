# Copyright: IQGeo Limited 2010-2023

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.circuit_manager import CircuitManager

class DevDbCircuitManager(CircuitManager):
    """
    Example custom circuit manager for the dev_db application
    """

    @classmethod
    def registerTriggers(self, NetworkView):
        """
        Register self's trigger methods on NETWORKVIEW
        """

        super(DevDbCircuitManager, self).registerTriggers(NetworkView)
        NetworkView.registerTrigger("circuit", "pos_insert", self, "exampleInsertTrigger")
        NetworkView.registerTrigger("circuit", "pos_get_api", self, "addCircuitRoute")
    
    def exampleInsertTrigger(self,circuit):
        """
        Example insert trigger
        """

        self.progress(2, "Running insert trigger", circuit)

    def addCircuitRoute(self, circuit, *args):
        """
        Example get API trigger that adds basic circuit route information to the response.
        """

        # Only do this for get requests with single result
        if isinstance(args[0], list):
            return 

        # Find path of circuit
        out_feature = circuit._field("out_feature").rec()
        out_pins = PinRange.parse(circuit.out_pins)
        in_node = self.findPathTo(out_feature, out_pins, 'fiber')

        # Build path list
        node = in_node
        path = []
        while node:
            json_node = {
                'type': node.type,
                'feature': node.feature._urn(),
                'pins': node.pins.spec
            }
            path.append(json_node)
            node = node.parent
            
        args[0]['circuitRoute'] = path        