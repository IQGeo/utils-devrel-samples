import requests; 
import json;

login_url   = 'https://example.com/auth'
select_url  = "https://example.com/select"

session = requests.Session()

uauth = {'user': 'admin','pass': '_mywWorld_',} 

response = session.post(login_url, data=uauth)
if response.status_code == 200:
    print (response)
    cookies = response.cookies.get_dict()
    print(json.dumps(cookies))

headers = {
    'Cookie': 'myworldapp=' + cookies['myworldapp'] + '; csrf_token=' + cookies['csrf_token']
}

latitude = 52.2087034
longitude = 0.1382864
zoom_level = 8
layer = ["bbc", "mywcom_fc"]

params = {
    "lat": latitude,
    "lon": longitude,
    "zoom": zoom_level,
    "layers": ",".join(layer), 
}
        
response2 = requests.get(select_url, params=params, headers=headers)

if response2.status_code == 200:
    data = response2.json()
    print("Fetched features:", data)
else:
    print("Error:", response2.status_code, response.text)