from myworldapp.modules.comms_dev_db.utils.circuit_routing_engine import CircuitRoutingEngine

# pylint: disable=undefined-variable
engine = CircuitRoutingEngine(db, 1)

# Direct-feed FTTH
engine.addFtthCircuit("WH-0132", "Direct", "Bourgh,AD")
engine.addFtthCircuit("WH-0133", "Direct", "Bingley,C")
engine.addFtthCircuit("WH-0150", "Direct", "Darcy,M")
engine.addFtthCircuit("WH-0149", "Direct", "Forester,H")
engine.addFtthCircuit("WH-0134", "Direct", "Bennet,L")
engine.addFtthCircuit("WH-0135", "Direct", "Pratt,M")
engine.addFtthCircuit("WH-0136", "Direct", "Morton,L")
engine.addFtthCircuit("WH-0137", "Direct", "Grey,S")
engine.addFtthCircuit("WH-0138", "Direct", "Dashwood,H")  # Planned
engine.addFtthCircuit("1001", "Direct", "Price,C", 1)  # MDU
engine.addFtthCircuit("1001", "Direct", "Coxe,W", 2, 1)
engine.addFtthCircuit("1001", "Direct", "Partridge,C", 3, 1)
engine.addFtthCircuit("WH-0145", "Direct", "Rushworth,J")  # MDU Planned
engine.addFtthCircuit("WH-0146", "Direct", "Dashwood,U")
engine.addFtthCircuit("WH-0147", "Direct", "Yates,J")  # Planned
engine.addFtthCircuit("WH-0148", "Direct", "Abdy,OJ")
# circuit_type,customer_name,ont_port_no=1,ont_no=1

"""
MDUs
"""

# Blackthorn
engine.addFtthCircuit("Blackthorn", "Direct", "Dice, J", 1, 1)
engine.addFtthCircuit("Blackthorn", "Direct", "Dennis, E", 1, 2)
engine.addFtthCircuit("Blackthorn", "Direct", "Brown, A", 1, 3)

# Alice Bell
engine.addFtthCircuit("101", "Direct", "Ferrars,E", 1, 1)
engine.addFtthCircuit("102", "Direct", "Bates,H", 1, 1)
engine.addFtthCircuit("103", "Direct", "Abbots,TM", 1, 1)
engine.addFtthCircuit("201", "Direct", "Helton,T", 1, 1)
engine.addFtthCircuit("202", "Direct", "Spilborghs,R", 1, 1)
engine.addFtthCircuit("203", "Direct", "Blackmon,C", 1, 1)

# Gladeside
engine.addFtthCircuit("1001", "Direct", "Davis,T", 1, 1)
engine.addFtthCircuit("1002", "Direct", "Atwater,S", 1, 1)
engine.addFtthCircuit("2001", "Direct", "Smith, R", 1, 1)
engine.addFtthCircuit("2002", "Direct", "Wilson, A", 1, 1)

# PON FTTH
engine.addFtthCircuit("WH-0001", "PON1", "Jennings,M")
engine.addFtthCircuit("WH-0002", "PON1", "Middleton,A")
engine.addFtthCircuit("WH-0003", "PON1", "Morton,LL")
engine.addFtthCircuit("WH-0004", "PON1", "Henshawe,B")
engine.addFtthCircuit("WH-0005", "PON1", "Ellison,M")
engine.addFtthCircuit("WH-0007", "PON1", "Davies,D")
engine.addFtthCircuit("WH-0008", "PON1", "Careys,T")
engine.addFtthCircuit("WH-0009", "PON1", "Brandon,E")
engine.addFtthCircuit("WH-0010", "PON1", "Goulding,W")
engine.addFtthCircuit("WH-0011", "PON1", "Harrington,H")
engine.addFtthCircuit("WH-0013", "PON1", "Lucas,SW")
engine.addFtthCircuit("WH-0014", "PON1", "Morris,M")
engine.addFtthCircuit("WH-0017", "PON1", "Nicholls,M")
engine.addFtthCircuit("WH-0019", "PON1", "Pratt,M")
engine.addFtthCircuit("WH-0020", "PON1", "Bertram,J")
engine.addFtthCircuit("WH-0022", "PON1", "Bertram,ST")
engine.addFtthCircuit("WH-0023", "PON1", "Norris,M")
engine.addFtthCircuit("WH-0024", "PON1", "Price,S")
engine.addFtthCircuit("WH-0025", "PON1", "Bragge,M")
engine.addFtthCircuit("WH-0027", "PON1", "Mitchell,F")
engine.addFtthCircuit("WH-0030", "PON1", "Nash,M")
engine.addFtthCircuit("WH-0034", "PON1", "Manwaring,M")
engine.addFtthCircuit("WH-0036", "PON1", "Otway,G")
engine.addFtthCircuit("WH-0033", "PON1", "Morland,M")
engine.addFtthCircuit("WH-0038", "PON1", "Thorpe,J")
engine.addFtthCircuit("WH-0040", "PON1", "Coucy,RD")
engine.addFtthCircuit("WH-0041", "PON1", "Martin,SJ")
engine.addFtthCircuit("WH-0042", "PON1", "Vernon,C")
engine.addFtthCircuit("WH-0043", "PON1", "Vernon,F")
engine.addFtthCircuit("WH-0044", "PON1", "Scroggs,M")

# BACKBONE
engine.addBbCircuit("WH-S-014#out:1", "SP-S-015#in:12")
engine.addBbCircuit("WH-S-014#out:3:4", "SP-S-015#in:14:15")
engine.addBbCircuit("SP-S-015#out:12:13", "WH-S-014#in:1:2")
engine.addBbCircuit("SP-S-015#out:14:15", "WH-S-014#in:3:4")
