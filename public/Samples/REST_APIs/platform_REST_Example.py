import requests; 
import json;

login_url   = 'https://support6x.us.iqgeo.com/plat/65_patched/auth'
select_url  = "https://support6x.us.iqgeo.com/plat/65_patched/select"
# login_url   = 'https://presales-enterprise-poc.us.iqgeo.cloud/echo-broadband/auth'
# select_url  = "https://presales-enterprise-poc.us.iqgeo.cloud/echo-broadband/select"
# login_url   = 'http://localhost/auth'
# select_url  = "http://localhost/select"


session = requests.Session()

uauth = {'user': 'admin','pass': '_mywWorld_',} 

response = session.post(login_url, data=uauth)
if response.status_code == 200:
    print(response)
    print()
    cookies = response.cookies.get_dict()
    print(json.dumps(cookies))
    print()
else:
    print("Error:", response2.status_code, response.text)

headers = {'cookie': 'myworldapp=' + cookies['myworldapp'] + '; csrf_token=' + cookies['csrf_token']}

latitude = 52.208
longitude = 0.13825
zoom_level = 25
layer = ["b", "C"]

params = {
    "lat": latitude,
    "lon": longitude,
    "zoom": zoom_level,
    "layers": ",".join(layer), 
}
        
response2 = requests.get(select_url, params=params, headers=headers)

if response2.status_code == 200:
    data = response2.json()
    print("fetched features:", data)
else:
    print("error:", response2.status_code, response.text)