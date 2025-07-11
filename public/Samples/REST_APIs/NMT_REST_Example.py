import requests
import json

login_url           = 'http://localhost/auth'
getFeatureByID_url  = 'http://localhost/modules/comms/api/v1/resourceInventoryManagement/resource/pole/4'
networkTrace_url    = 'http://localhost/modules/comms/api/v1/networkTrace?network=mywcom_fiber&from=fiber_splitter/2?pins=out:1'

session = requests.Session()

user = input("Enter username: ")
password = input("Enter password: ")

uauth = {"user": user, "pass": password}

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