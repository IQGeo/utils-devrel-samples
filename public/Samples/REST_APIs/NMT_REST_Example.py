import requests
import json

login_url           = 'https://comms.den1appsqa02.iqgeo.com/auth'
getFeatureByID_url  = 'https://comms.den1appsqa02.iqgeo.com/modules/comms/api/v1/resourceInventoryManagement/resource/design'
networkTrace_url    = 'https://comms.den1appsqa02.iqgeo.com/modules/comms/api/v1/networkTrace?network=mywcom_fiber&from=mywcom_fiber_segment/1?pins=out:1'
create_url          = 'https://comms.den1appsqa02.iqgeo.com/modules/comms/api/v1/resourceInventoryManagement/resource/building'

# login_url           = 'https://comms.den1appsqa02.iqgeo.com/auth'
# getFeatureByID_url  = 'https://comms.den1appsqa02.iqgeo.com/modules/comms/api/v1/resourceInventoryManagement/resource/fiber_cable/174?fields=name%2Cspecification%2Ctype%2Cdirected'
# networkTrace_url    = 'https://comms.den1appsqa02.iqgeo.com/modules/comms/api/v1/networkTrace?network=mywcom_fiber&from=mywcom_fiber_segment/1?pins=out:1'




#   'http://comms.den1appsqa02.iqgeo.com/modules/comms/api/v1/networkTrace?network=mywcom_fiber&from=mywcom_fiber_segment%2F1%3Fpins%3Dout%3A1'
# networkTrace_url = 'http://localhost:82/modules/comms/api/v1/networkTrace?network=mywcom_fiber&from=mywcom_fiber_segment%2F1%3Fpins%3Dout%3A1&direction=downstream&maxDistance=1000&maxNodes=500&application=mywcom&delta=design%2FCC4970'
# login_url   = 'http://localhost/auth'
# select_url  = "http://localhost/select"

session = requests.Session()

uauth = {"user": 'admin', "pass": '_mywWorld_'}

response = session.post(login_url, data=uauth, allow_redirects=True)
if response.status_code == 200:
    print (response)
    cookies = response.cookies.get_dict()
    print(json.dumps(cookies))
else:
    print(response)
headers = {
    'Cookie': 'myworldapp=' + cookies['myworldapp'] + '; csrf_token=' + cookies['csrf_token']
}

getFeatureResponse = session.get(getFeatureByID_url, headers=headers)
print(getFeatureResponse.status_code)
print(getFeatureResponse.json())

# networkTraceResponse = session.get(networkTrace_url, headers=headers)
# print(networkTraceResponse.status_code)
# print(networkTraceResponse.json())

# spec= {
#       "name": "REST Building",
#       "specification": "",
#       "laborCosts": "",
#       "location": {
#         "type": "Point",
#         "coordinates": [30, 30]
#       },
#       "characteristic": [
#         {
#           "name": "createdAt",
#           "value": "2025-06-03T19:41:06.710147"
#         },
#         {
#           "name": "createUser",
#           "value": "Jay"
#         },
#         {
#           "name": "updatedAt",
#           "value": ''
#         },
#         {
#           "name": "updateUser",
#           "value": ''
#         },
#         {
#           "name": "sortChildren",
#           "value": ''
#         },
#         {
#           "name": "owner",
#           "value": "REST API"
#         }
#       ],
#       "@type": "Structure",
#       "@baseType": "Feature"
#     }

# createFeatureResponse = session.post(create_url, headers=headers, json=spec)
# print(createFeatureResponse.status_code)
# print(createFeatureResponse.json())