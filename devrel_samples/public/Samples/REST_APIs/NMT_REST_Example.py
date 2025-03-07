import requests
import json

login_url       = 'https://comms.den1appsqa02.iqgeo.com/auth'
getFeature_url  = 'https://comms.den1appsqa02.iqgeo.com/modules/comms/api/v1/resourceInventoryManagement/resource/fiber_cable/174?name=DROP-140&fields=name%2Cspecification'

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

getFeatureResponse = session.get(getFeature_url, headers=headers)
print(getFeatureResponse.status_code)
print(getFeatureResponse.json())